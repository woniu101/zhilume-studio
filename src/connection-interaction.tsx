import { createContext, useContext, useEffect, useRef, useState } from "react";
import { getBezierPath, Position, useReactFlow, useStoreApi, type Connection, type Edge, type ConnectionLineComponentProps, type OnConnectStart, type OnConnectEnd } from "@xyflow/react";

type Preview = { x: number; y: number; position: Position; valid: boolean } | null;
export const ConnectionPreview = createContext<Preview>(null);

export function CanvasConnectionLine(props: ConnectionLineComponentProps) {
  const preview = useContext(ConnectionPreview);
  const ready = preview?.valid ?? props.connectionStatus === "valid";
  const x = preview?.valid ? preview.x : props.toX;
  const y = preview?.valid ? preview.y : props.toY;
  const [path] = getBezierPath({ sourceX: props.fromX, sourceY: props.fromY,
    sourcePosition: props.fromPosition, targetX: x, targetY: y,
    targetPosition: preview?.valid ? preview.position : props.toPosition });
  return <g className={`canvas-connection-preview ${ready ? "ready" : preview ? "invalid" : ""}`}>
    <path d={path} fill="none" strokeWidth={1.5} />
    {!ready && <circle cx={x} cy={y} r={2.5} stroke="none" />}
  </g>;
}

/** Whole-card drop targets, while React Flow retains handle drag and autopan. */
export function useCanvasConnection(commit: (c: Connection) => void, valid: (c: Connection) => boolean) {
  const flow = useReactFlow(), store = useStoreApi();
  const callbacks = useRef({ commit, valid });
  callbacks.current = { commit, valid };
  const origin = useRef<{ id: string; type: string } | null>(null);
  const cancelled = useRef(false);
  const highlighted = useRef<HTMLElement | null>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const clear = () => {
    highlighted.current?.removeAttribute("data-connect-drop");
    highlighted.current = null;
    setPreview(null);
  };
  const hit = (x: number, y: number) => {
    const nodeElement = document.elementFromPoint(x, y)?.closest<HTMLElement>(".react-flow__node-media");
    const id = nodeElement?.dataset.id;
    const start = origin.current;
    if (!id || !start || id === start.id) return null;
    const node = flow.getInternalNode(id);
    if (!node || node.type !== "media") return null;
    const reverse = start.type === "target";
    const connection = { source: reverse ? id : start.id, target: reverse ? start.id : id, sourceHandle: null, targetHandle: null };
    return { nodeElement: nodeElement!, connection, valid: callbacks.current.valid(connection),
      x: node.internals.positionAbsolute.x + (reverse ? node.measured.width ?? 0 : 0),
      y: node.internals.positionAbsolute.y + (node.measured.height ?? 0) / 2,
      position: reverse ? Position.Right : Position.Left };
  };
  useEffect(() => {
    const move = (event: MouseEvent | TouchEvent) => {
      if (!origin.current || cancelled.current) return;
      const point = "touches" in event ? event.touches[0] : event;
      if (!point) return;
      const target = hit(point.clientX, point.clientY);
      highlighted.current?.removeAttribute("data-connect-drop");
      highlighted.current = target?.nodeElement ?? null;
      target?.nodeElement.setAttribute("data-connect-drop", target.valid ? "ready" : "invalid");
      setPreview(target ? { x: target.x, y: target.y, position: target.position, valid: target.valid } : null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !origin.current) return;
      cancelled.current = true;
      origin.current = null;
      store.getState().cancelConnection();
      clear();
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener("mousemove", move, true);
    document.addEventListener("touchmove", move, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("touchmove", move, true);
      document.removeEventListener("keydown", key, true);
      highlighted.current?.removeAttribute("data-connect-drop");
    };
  }, [flow, store]);
  const onConnectStart: OnConnectStart = (_, params) => {
    cancelled.current = false;
    origin.current = params.nodeId ? { id: params.nodeId, type: params.handleType ?? "source" } : null;
  };
  const onConnectEnd: OnConnectEnd = (event, state) => {
    if (!cancelled.current && !state.isValid) {
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      const target = point && hit(point.clientX, point.clientY);
      if (target?.valid) callbacks.current.commit(target.connection);
    }
    origin.current = null;
    clear();
  };
  return { preview, props: { onConnectStart, onConnectEnd,
    onClickConnectStart: onConnectStart,
    onClickConnectEnd: onConnectEnd,
    onConnect: (connection: Connection) => { if (!cancelled.current && callbacks.current.valid(connection)) callbacks.current.commit(connection); },
    isValidConnection: (connection: Connection | Edge) => !cancelled.current && callbacks.current.valid({ ...connection, sourceHandle: connection.sourceHandle ?? null, targetHandle: connection.targetHandle ?? null }),
    connectionLineComponent: CanvasConnectionLine,
    connectionRadius: 24,
  } };
}
