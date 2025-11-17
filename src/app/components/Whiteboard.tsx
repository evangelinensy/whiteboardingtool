"use client";

import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";

export interface WhiteboardElement {
  id: string;
  type: "rect" | "text" | "arrow" | "ellipse" | "line" | "pen";
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  points?: { x: number; y: number }[]; // For pen tool
  style: {
    strokeColor: string;
    strokeWidth: number;
    fill: string;
    fontSize: number;
    fontWeight: "normal" | "bold";
    fontStyle?: "normal" | "italic";
    textDecoration?: "none" | "underline";
  };
  fromElementId?: string;
  toElementId?: string;
}

interface WhiteboardProps {
  onSummaryChange: (summary: {
    elementsCount: number;
    rectanglesCount: number;
    textCount: number;
    arrowsCount: number;
    titles: string[];
  }) => void;
  onExport: (base64: string) => void;
}

export interface WhiteboardRef {
  getCanvasImage: () => Promise<string>;
  reset: () => void;
}

type Tool = "select" | "rect" | "text" | "arrow" | "ellipse" | "pan" | "line" | "pen";

const Whiteboard = forwardRef<WhiteboardRef, WhiteboardProps>(function Whiteboard({
  onSummaryChange,
  onExport,
}, ref) {
  const [elements, setElements] = useState<WhiteboardElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<Tool>("select");
  const [history, setHistory] = useState<WhiteboardElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [dragMode, setDragMode] = useState<
    "none" | "create" | "move" | "resize" | "marquee"
  >("none");
  const [resizeHandle, setResizeHandle] = useState<string>("");
  const [marqueeRect, setMarqueeRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [arrowStart, setArrowStart] = useState<{
    elementId: string;
    x: number;
    y: number;
  } | null>(null);
  const [currentPenPoints, setCurrentPenPoints] = useState<{ x: number; y: number }[]>([]);
  const [isDrawingPen, setIsDrawingPen] = useState(false);
  const [clipboard, setClipboard] = useState<WhiteboardElement[]>([]);
  const [currentStyle, setCurrentStyle] = useState({
    strokeColor: "#374151",
    strokeWidth: 2,
    fill: "none",
    fontSize: 14,
    fontWeight: "normal" as "normal" | "bold",
    fontStyle: "normal" as "normal" | "italic",
    textDecoration: "none" as "none" | "underline",
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Expose getCanvasImage method to parent via ref
  useImperativeHandle(ref, () => ({
    getCanvasImage: () => {
      return new Promise<string>((resolve) => {
        const svg = svgRef.current;
        if (!svg) {
          resolve("");
          return;
        }

        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
          console.warn("Canvas image capture timed out");
          resolve("");
        }, 5000);

        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 800;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          clearTimeout(timeout);
          resolve("");
          return;
        }

        const img = new Image();
        img.onload = () => {
          clearTimeout(timeout);
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          const base64 = canvas.toDataURL("image/png");
          resolve(base64);
        };
        img.onerror = () => {
          clearTimeout(timeout);
          resolve("");
        };
        img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
      });
    },
    reset: () => {
      setElements([]);
      setSelectedIds(new Set());
      setTool("select");
      setHistory([[]]);
      setHistoryIndex(0);
      setPanOffset({ x: 0, y: 0 });
      setZoom(1);
      setEditingTextId(null);
      setArrowStart(null);
    }
  }), []);

  // Update summary when elements change
  useEffect(() => {
    const summary = {
      elementsCount: elements.length,
      rectanglesCount: elements.filter((e) => e.type === "rect" || e.type === "ellipse").length,
      textCount: elements.filter((e) => e.type === "text").length,
      arrowsCount: elements.filter((e) => e.type === "arrow" || e.type === "line" || e.type === "pen").length,
      titles: elements
        .filter((e) => e.type === "text" && e.text)
        .map((e) => e.text!)
        .slice(0, 5),
    };
    onSummaryChange(summary);
  }, [elements, onSummaryChange]);

  // Push to history
  const pushHistory = useCallback(
    (newElements: WhiteboardElement[]) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newElements);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    },
    [history, historyIndex]
  );

  // Undo
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setElements(history[historyIndex - 1]);
    }
  }, [historyIndex, history]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setElements(history[historyIndex + 1]);
    }
  }, [historyIndex, history]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingTextId) return;

      if (e.key === "v" || e.key === "V") {
        setTool("select");
      } else if (e.key === "r" || e.key === "R") {
        setTool("rect");
      } else if (e.key === "t" || e.key === "T") {
        setTool("text");
      } else if (e.key === "a" || e.key === "A") {
        setTool("arrow");
      } else if (e.key === "l" || e.key === "L") {
        setTool("line");
      } else if (e.key === "p" || e.key === "P") {
        setTool("pen");
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.size > 0) {
          const newElements = elements.filter((el) => !selectedIds.has(el.id));
          setElements(newElements);
          pushHistory(newElements);
          setSelectedIds(new Set());
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        // Copy selected elements
        e.preventDefault();
        if (selectedIds.size > 0) {
          const copiedElements = elements.filter((el) => selectedIds.has(el.id));
          setClipboard(copiedElements);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "v" && !editingTextId) {
        // Paste elements
        e.preventDefault();
        if (clipboard.length > 0) {
          const pastedElements = clipboard.map((el) => ({
            ...el,
            id: generateId(),
            x: el.x + 20,
            y: el.y + 20,
            points: el.points ? el.points.map((p) => ({ x: p.x + 20, y: p.y + 20 })) : undefined,
          }));
          const newElements = [...elements, ...pastedElements];
          setElements(newElements);
          pushHistory(newElements);
          setSelectedIds(new Set(pastedElements.map((el) => el.id)));
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        // Duplicate selected elements
        e.preventDefault();
        if (selectedIds.size > 0) {
          const selectedElements = elements.filter((el) => selectedIds.has(el.id));
          const duplicatedElements = selectedElements.map((el) => ({
            ...el,
            id: generateId(),
            x: el.x + 20,
            y: el.y + 20,
            points: el.points ? el.points.map((p) => ({ x: p.x + 20, y: p.y + 20 })) : undefined,
          }));
          const newElements = [...elements, ...duplicatedElements];
          setElements(newElements);
          pushHistory(newElements);
          setSelectedIds(new Set(duplicatedElements.map((el) => el.id)));
        }
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "z" &&
        !e.shiftKey
      ) {
        e.preventDefault();
        undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key === "z" || e.key === "Z")
      ) {
        e.preventDefault();
        redo();
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPanning(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setIsPanning(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    editingTextId,
    selectedIds,
    elements,
    pushHistory,
    undo,
    redo,
  ]);

  // Handle wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom((z) => Math.min(3, Math.max(0.3, z * delta)));
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  const getMousePos = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - panOffset.x) / zoom,
      y: (e.clientY - rect.top - panOffset.y) / zoom,
    };
  };

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const hitTest = (x: number, y: number): string | null => {
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el.type === "arrow") {
        // Simple hit test for arrows
        const midX = (el.x + (el.x + el.w)) / 2;
        const midY = (el.y + (el.y + el.h)) / 2;
        if (Math.abs(x - midX) < 10 && Math.abs(y - midY) < 10) {
          return el.id;
        }
      } else if (
        x >= el.x &&
        x <= el.x + el.w &&
        y >= el.y &&
        y <= el.y + el.h
      ) {
        return el.id;
      }
    }
    return null;
  };

  const getResizeHandle = (
    x: number,
    y: number,
    el: WhiteboardElement
  ): string => {
    const handleSize = 8;
    if (
      Math.abs(x - el.x) < handleSize &&
      Math.abs(y - el.y) < handleSize
    )
      return "nw";
    if (
      Math.abs(x - (el.x + el.w)) < handleSize &&
      Math.abs(y - el.y) < handleSize
    )
      return "ne";
    if (
      Math.abs(x - el.x) < handleSize &&
      Math.abs(y - (el.y + el.h)) < handleSize
    )
      return "sw";
    if (
      Math.abs(x - (el.x + el.w)) < handleSize &&
      Math.abs(y - (el.y + el.h)) < handleSize
    )
      return "se";
    return "";
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getMousePos(e);
    setDragStart(pos);

    if (isPanning || tool === "pan") {
      setDragMode("create");
      return;
    }

    if (tool === "select") {
      const hitId = hitTest(pos.x, pos.y);
      if (hitId) {
        const el = elements.find((e) => e.id === hitId);
        if (el && selectedIds.has(hitId)) {
          const handle = getResizeHandle(pos.x, pos.y, el);
          if (handle) {
            setDragMode("resize");
            setResizeHandle(handle);
          } else {
            setDragMode("move");
          }
        } else {
          if (!e.shiftKey) {
            setSelectedIds(new Set([hitId]));
          } else {
            const newSelected = new Set(selectedIds);
            newSelected.add(hitId);
            setSelectedIds(newSelected);
          }
          setDragMode("move");
        }
      } else {
        setSelectedIds(new Set());
        setDragMode("marquee");
        setMarqueeRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
      }
    } else if (tool === "rect" || tool === "ellipse" || tool === "line") {
      setDragMode("create");
    } else if (tool === "pen") {
      setIsDrawingPen(true);
      setCurrentPenPoints([pos]);
      setDragMode("create");
    } else if (tool === "text") {
      const newElement: WhiteboardElement = {
        id: generateId(),
        type: "text",
        x: pos.x,
        y: pos.y,
        w: 300,
        h: 60,
        text: "",
        style: { ...currentStyle },
      };
      const newElements = [...elements, newElement];
      setElements(newElements);
      pushHistory(newElements);
      setEditingTextId(newElement.id);
      setSelectedIds(new Set([newElement.id]));
    } else if (tool === "arrow") {
      const hitId = hitTest(pos.x, pos.y);
      if (hitId) {
        setArrowStart({ elementId: hitId, x: pos.x, y: pos.y });
      } else {
        setArrowStart({ elementId: "", x: pos.x, y: pos.y });
      }
      setDragMode("create");
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragStart) return;
    const pos = getMousePos(e);

    if (isPanning || tool === "pan") {
      setPanOffset({
        x: panOffset.x + (pos.x - dragStart.x) * zoom,
        y: panOffset.y + (pos.y - dragStart.y) * zoom,
      });
      return;
    }

    if (dragMode === "marquee" && marqueeRect) {
      setMarqueeRect({
        x: Math.min(dragStart.x, pos.x),
        y: Math.min(dragStart.y, pos.y),
        w: Math.abs(pos.x - dragStart.x),
        h: Math.abs(pos.y - dragStart.y),
      });
    } else if (dragMode === "move" && selectedIds.size > 0) {
      const dx = pos.x - dragStart.x;
      const dy = pos.y - dragStart.y;
      setElements(
        elements.map((el) =>
          selectedIds.has(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el
        )
      );
      setDragStart(pos);
    } else if (dragMode === "resize" && selectedIds.size === 1) {
      const elId = Array.from(selectedIds)[0];
      setElements(
        elements.map((el) => {
          if (el.id !== elId) return el;
          const newEl = { ...el };
          if (resizeHandle.includes("e")) {
            newEl.w = pos.x - el.x;
          }
          if (resizeHandle.includes("w")) {
            newEl.w = el.x + el.w - pos.x;
            newEl.x = pos.x;
          }
          if (resizeHandle.includes("s")) {
            newEl.h = pos.y - el.y;
          }
          if (resizeHandle.includes("n")) {
            newEl.h = el.y + el.h - pos.y;
            newEl.y = pos.y;
          }
          return newEl;
        })
      );
    } else if (isDrawingPen && tool === "pen") {
      setCurrentPenPoints((prev) => [...prev, pos]);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const pos = getMousePos(e);

    if (dragMode === "marquee" && marqueeRect) {
      const selected = elements.filter(
        (el) =>
          el.x >= marqueeRect.x &&
          el.x + el.w <= marqueeRect.x + marqueeRect.w &&
          el.y >= marqueeRect.y &&
          el.y + el.h <= marqueeRect.y + marqueeRect.h
      );
      setSelectedIds(new Set(selected.map((el) => el.id)));
      setMarqueeRect(null);
    } else if (dragMode === "create" && dragStart) {
      if (tool === "rect" || tool === "ellipse") {
        const newElement: WhiteboardElement = {
          id: generateId(),
          type: tool,
          x: Math.min(dragStart.x, pos.x),
          y: Math.min(dragStart.y, pos.y),
          w: Math.abs(pos.x - dragStart.x),
          h: Math.abs(pos.y - dragStart.y),
          style: { ...currentStyle },
        };
        if (newElement.w > 5 && newElement.h > 5) {
          const newElements = [...elements, newElement];
          setElements(newElements);
          pushHistory(newElements);
          // Auto-select created element and switch to select tool
          setSelectedIds(new Set([newElement.id]));
          setTool("select");
        }
      } else if (tool === "line") {
        const newElement: WhiteboardElement = {
          id: generateId(),
          type: "line",
          x: dragStart.x,
          y: dragStart.y,
          w: pos.x - dragStart.x,
          h: pos.y - dragStart.y,
          style: { ...currentStyle },
        };
        const newElements = [...elements, newElement];
        setElements(newElements);
        pushHistory(newElements);
        // Auto-select and switch to select tool
        setSelectedIds(new Set([newElement.id]));
        setTool("select");
      } else if (tool === "pen" && currentPenPoints.length > 1) {
        // Calculate bounding box for pen stroke
        const xs = currentPenPoints.map((p) => p.x);
        const ys = currentPenPoints.map((p) => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);

        const newElement: WhiteboardElement = {
          id: generateId(),
          type: "pen",
          x: minX,
          y: minY,
          w: maxX - minX,
          h: maxY - minY,
          points: currentPenPoints,
          style: { ...currentStyle },
        };
        const newElements = [...elements, newElement];
        setElements(newElements);
        pushHistory(newElements);
        setCurrentPenPoints([]);
        setIsDrawingPen(false);
        // Auto-select and switch to select tool
        setSelectedIds(new Set([newElement.id]));
        setTool("select");
      } else if (tool === "arrow" && arrowStart) {
        const endHitId = hitTest(pos.x, pos.y);
        const newElement: WhiteboardElement = {
          id: generateId(),
          type: "arrow",
          x: arrowStart.x,
          y: arrowStart.y,
          w: pos.x - arrowStart.x,
          h: pos.y - arrowStart.y,
          style: { ...currentStyle },
          fromElementId: arrowStart.elementId || undefined,
          toElementId: endHitId || undefined,
        };
        const newElements = [...elements, newElement];
        setElements(newElements);
        pushHistory(newElements);
        setArrowStart(null);
        // Auto-select and switch to select tool
        setSelectedIds(new Set([newElement.id]));
        setTool("select");
      }
    } else if (dragMode === "move" || dragMode === "resize") {
      pushHistory(elements);
    }

    setDragStart(null);
    setDragMode("none");
  };

  const handleTextChange = (id: string, text: string) => {
    setElements(elements.map((el) => {
      if (el.id !== id) return el;
      // Don't auto-resize width - let user control it via resize handles
      // Only update text content, keep current dimensions for wrapping
      return { ...el, text };
    }));
  };

  const handleTextBlur = () => {
    setEditingTextId(null);
    pushHistory(elements);
    // Switch to select tool after finishing text entry
    setTool("select");
  };

  const toggleTextBold = (id: string) => {
    setElements(elements.map((el) => {
      if (el.id !== id) return el;
      return {
        ...el,
        style: {
          ...el.style,
          fontWeight: el.style.fontWeight === "bold" ? "normal" : "bold",
        },
      };
    }));
  };

  const toggleTextItalic = (id: string) => {
    setElements(elements.map((el) => {
      if (el.id !== id) return el;
      return {
        ...el,
        style: {
          ...el.style,
          fontStyle: el.style.fontStyle === "italic" ? "normal" : "italic",
        },
      };
    }));
  };

  const toggleTextUnderline = (id: string) => {
    setElements(elements.map((el) => {
      if (el.id !== id) return el;
      return {
        ...el,
        style: {
          ...el.style,
          textDecoration: el.style.textDecoration === "underline" ? "none" : "underline",
        },
      };
    }));
  };

  const bringToFront = () => {
    if (selectedIds.size === 0) return;
    const selected = elements.filter((el) => selectedIds.has(el.id));
    const rest = elements.filter((el) => !selectedIds.has(el.id));
    const newElements = [...rest, ...selected];
    setElements(newElements);
    pushHistory(newElements);
  };

  const sendToBack = () => {
    if (selectedIds.size === 0) return;
    const selected = elements.filter((el) => selectedIds.has(el.id));
    const rest = elements.filter((el) => !selectedIds.has(el.id));
    const newElements = [...selected, ...rest];
    setElements(newElements);
    pushHistory(newElements);
  };

  const exportPNG = () => {
    const svg = svgRef.current;
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const base64 = canvas.toDataURL("image/png").split(",")[1];
      onExport(base64);

      // Also trigger download
      const link = document.createElement("a");
      link.download = "whiteboard.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const resetView = () => {
    setPanOffset({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar - Figma-style dark toolbar */}
      <div className="flex items-center gap-1 p-3 bg-white border-b">
        {/* Main tools group */}
        <div className="flex items-center bg-gray-900 rounded-lg p-1 gap-0.5">
          <button
            onClick={() => setTool("select")}
            className={`relative p-2.5 rounded-md transition-colors group ${
              tool === "select"
                ? "bg-blue-500 text-white"
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
            aria-label="Select tool (V)"
            title="Select (V)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
            </svg>
            <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold bg-gray-700 text-gray-300 px-1 rounded">V</span>
          </button>
          <button
            onClick={() => setTool("rect")}
            className={`relative p-2.5 rounded-md transition-colors group ${
              tool === "rect"
                ? "bg-blue-500 text-white"
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
            aria-label="Rectangle tool (R)"
            title="Rectangle (R)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
            <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold bg-gray-700 text-gray-300 px-1 rounded">R</span>
          </button>
          <button
            onClick={() => setTool("text")}
            className={`relative p-2.5 rounded-md transition-colors group ${
              tool === "text"
                ? "bg-blue-500 text-white"
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
            aria-label="Text tool (T)"
            title="Text (T)"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5 4v3h5.5v12h3V7H19V4H5z" />
            </svg>
            <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold bg-gray-700 text-gray-300 px-1 rounded">T</span>
          </button>
          <button
            onClick={() => setTool("arrow")}
            className={`relative p-2.5 rounded-md transition-colors group ${
              tool === "arrow"
                ? "bg-blue-500 text-white"
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
            aria-label="Arrow tool (A)"
            title="Arrow (A)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
            <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold bg-gray-700 text-gray-300 px-1 rounded">A</span>
          </button>
          <button
            onClick={() => setTool("ellipse")}
            className={`relative p-2.5 rounded-md transition-colors group ${
              tool === "ellipse"
                ? "bg-blue-500 text-white"
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
            aria-label="Ellipse tool (O)"
            title="Ellipse (O)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="9" />
            </svg>
            <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold bg-gray-700 text-gray-300 px-1 rounded">O</span>
          </button>
          <button
            onClick={() => setTool("line")}
            className={`relative p-2.5 rounded-md transition-colors group ${
              tool === "line"
                ? "bg-blue-500 text-white"
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
            aria-label="Line tool (L)"
            title="Line (L)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <line x1="5" y1="19" x2="19" y2="5" />
            </svg>
            <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold bg-gray-700 text-gray-300 px-1 rounded">L</span>
          </button>
          <button
            onClick={() => setTool("pen")}
            className={`relative p-2.5 rounded-md transition-colors group ${
              tool === "pen"
                ? "bg-blue-500 text-white"
                : "text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
            aria-label="Pen tool (P)"
            title="Pen (P)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold bg-gray-700 text-gray-300 px-1 rounded">P</span>
          </button>
        </div>

        {/* Undo/Redo group */}
        <div className="flex items-center bg-gray-900 rounded-lg p-1 gap-0.5 ml-2">
          <button
            onClick={undo}
            className="p-2.5 rounded-md text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
            aria-label="Undo (Ctrl+Z)"
            title="Undo (Ctrl+Z)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
          </button>
          <button
            onClick={redo}
            className="p-2.5 rounded-md text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
            aria-label="Redo (Ctrl+Shift+Z)"
            title="Redo (Ctrl+Shift+Z)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
            </svg>
          </button>
        </div>

        {/* View controls */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              showGrid
                ? "bg-blue-100 text-blue-700 border border-blue-300"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
          >
            Grid
          </button>
          <button
            onClick={exportPNG}
            className="px-4 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition-colors"
          >
            Export PNG
          </button>
          <span className="text-sm font-medium text-gray-600 ml-2">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden bg-white relative"
        style={{
          cursor: isPanning
            ? "grab"
            : dragMode === "move"
            ? "grabbing"
            : dragMode === "resize"
            ? "nwse-resize"
            : dragMode === "create"
            ? "crosshair"
            : tool === "select"
            ? "default"
            : tool === "pen"
            ? "crosshair"
            : tool === "text"
            ? "text"
            : "crosshair",
        }}
      >
        {/* Floating text input for editing */}
        {editingTextId && (() => {
          const editingEl = elements.find(e => e.id === editingTextId);
          if (!editingEl) return null;
          return (
            <div
              className="absolute z-50"
              style={{
                left: `${editingEl.x * zoom + panOffset.x}px`,
                top: `${editingEl.y * zoom + panOffset.y}px`,
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Text styling toolbar */}
              <div className="flex gap-1 mb-1 bg-gray-800 rounded p-1">
                <button
                  onClick={() => toggleTextBold(editingTextId)}
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    editingEl.style.fontWeight === "bold"
                      ? "bg-blue-500 text-white"
                      : "text-gray-300 hover:bg-gray-700"
                  }`}
                  title="Bold (Ctrl+B)"
                >
                  B
                </button>
                <button
                  onClick={() => toggleTextItalic(editingTextId)}
                  className={`px-2 py-1 rounded text-xs italic ${
                    editingEl.style.fontStyle === "italic"
                      ? "bg-blue-500 text-white"
                      : "text-gray-300 hover:bg-gray-700"
                  }`}
                  title="Italic (Ctrl+I)"
                >
                  I
                </button>
                <button
                  onClick={() => toggleTextUnderline(editingTextId)}
                  className={`px-2 py-1 rounded text-xs underline ${
                    editingEl.style.textDecoration === "underline"
                      ? "bg-blue-500 text-white"
                      : "text-gray-300 hover:bg-gray-700"
                  }`}
                  title="Underline (Ctrl+U)"
                >
                  U
                </button>
                <span className="text-xs text-gray-400 ml-2 self-center">Esc to close</span>
              </div>
              <textarea
                value={editingEl.text || ""}
                onChange={(e) => handleTextChange(editingTextId, e.target.value)}
                onBlur={handleTextBlur}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  // Only Escape closes, Enter creates new line
                  if (e.key === "Escape") handleTextBlur();
                  // Text formatting shortcuts
                  if ((e.ctrlKey || e.metaKey) && e.key === "b") {
                    e.preventDefault();
                    toggleTextBold(editingTextId);
                  }
                  if ((e.ctrlKey || e.metaKey) && e.key === "i") {
                    e.preventDefault();
                    toggleTextItalic(editingTextId);
                  }
                  if ((e.ctrlKey || e.metaKey) && e.key === "u") {
                    e.preventDefault();
                    toggleTextUnderline(editingTextId);
                  }
                }}
                ref={(textarea) => {
                  // Focus the textarea after a small delay to ensure it's mounted
                  if (textarea) {
                    setTimeout(() => {
                      textarea.focus();
                      // Place cursor at end
                      textarea.selectionStart = textarea.value.length;
                    }, 10);
                  }
                }}
                className="border-2 border-blue-500 outline-none bg-white px-2 py-1 rounded shadow-lg focus:ring-2 focus:ring-blue-400 resize-none"
                style={{
                  fontSize: `${editingEl.style.fontSize * zoom}px`,
                  fontWeight: editingEl.style.fontWeight,
                  fontStyle: editingEl.style.fontStyle || "normal",
                  textDecoration: editingEl.style.textDecoration || "none",
                  color: editingEl.style.strokeColor,
                  minWidth: "200px",
                  minHeight: "60px",
                  width: `${Math.max(editingEl.w * zoom, 200)}px`,
                  height: `${Math.max(editingEl.h * zoom, 60)}px`,
                }}
                placeholder="Type here..."
              />
            </div>
          );
        })()}
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          className="absolute inset-0"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#374151" />
            </marker>
          </defs>

          <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}>
            {/* Grid */}
            {showGrid && (
              <g opacity="0.3">
                {Array.from({ length: 100 }).map((_, i) =>
                  Array.from({ length: 100 }).map((_, j) => (
                    <circle
                      key={`${i}-${j}`}
                      cx={i * 20}
                      cy={j * 20}
                      r="1"
                      fill="#9CA3AF"
                    />
                  ))
                )}
              </g>
            )}

            {/* Elements */}
            {elements.map((el) => {
              const isSelected = selectedIds.has(el.id);
              return (
                <g key={el.id}>
                  {el.type === "rect" && (
                    <rect
                      x={el.x}
                      y={el.y}
                      width={el.w}
                      height={el.h}
                      stroke={el.style.strokeColor}
                      strokeWidth={el.style.strokeWidth}
                      fill={el.style.fill}
                      className={isSelected ? "outline outline-2 outline-blue-500" : ""}
                      style={{ cursor: tool === "select" ? "grab" : "inherit" }}
                    />
                  )}
                  {el.type === "ellipse" && (
                    <ellipse
                      cx={el.x + el.w / 2}
                      cy={el.y + el.h / 2}
                      rx={el.w / 2}
                      ry={el.h / 2}
                      stroke={el.style.strokeColor}
                      strokeWidth={el.style.strokeWidth}
                      fill={el.style.fill}
                      className={isSelected ? "outline outline-2 outline-blue-500" : ""}
                      style={{ cursor: tool === "select" ? "grab" : "inherit" }}
                    />
                  )}
                  {el.type === "text" && (
                    <g>
                      <rect
                        x={el.x}
                        y={el.y}
                        width={el.w}
                        height={el.h}
                        fill="transparent"
                        stroke={isSelected ? "#3B82F6" : "transparent"}
                        strokeWidth="1"
                        strokeDasharray={isSelected ? "4" : "0"}
                      />
                      <foreignObject
                        x={el.x}
                        y={el.y}
                        width={el.w}
                        height={el.h}
                        onDoubleClick={() => setEditingTextId(el.id)}
                        style={{ cursor: tool === "select" ? "grab" : "text", overflow: "hidden" }}
                      >
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            fontSize: `${el.style.fontSize}px`,
                            fontWeight: el.style.fontWeight,
                            fontStyle: el.style.fontStyle || "normal",
                            textDecoration: el.style.textDecoration || "none",
                            color: el.style.strokeColor,
                            padding: "5px",
                            boxSizing: "border-box",
                            wordWrap: "break-word",
                            overflowWrap: "break-word",
                            whiteSpace: "pre-wrap",
                            overflow: "hidden",
                            lineHeight: "1.3",
                          }}
                        >
                          {el.text || "Text"}
                        </div>
                      </foreignObject>
                    </g>
                  )}
                  {el.type === "arrow" && (
                    <line
                      x1={el.x}
                      y1={el.y}
                      x2={el.x + el.w}
                      y2={el.y + el.h}
                      stroke={el.style.strokeColor}
                      strokeWidth={el.style.strokeWidth}
                      markerEnd="url(#arrowhead)"
                      className={isSelected ? "outline outline-2 outline-blue-500" : ""}
                      style={{ cursor: tool === "select" ? "grab" : "inherit" }}
                    />
                  )}
                  {el.type === "line" && (
                    <line
                      x1={el.x}
                      y1={el.y}
                      x2={el.x + el.w}
                      y2={el.y + el.h}
                      stroke={el.style.strokeColor}
                      strokeWidth={el.style.strokeWidth}
                      strokeLinecap="round"
                      className={isSelected ? "outline outline-2 outline-blue-500" : ""}
                      style={{ cursor: tool === "select" ? "grab" : "inherit" }}
                    />
                  )}
                  {el.type === "pen" && el.points && el.points.length > 1 && (
                    <polyline
                      points={el.points.map((p) => `${p.x},${p.y}`).join(" ")}
                      stroke={el.style.strokeColor}
                      strokeWidth={el.style.strokeWidth}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={isSelected ? "outline outline-2 outline-blue-500" : ""}
                      style={{ cursor: tool === "select" ? "grab" : "inherit" }}
                    />
                  )}

                  {/* Resize handles for selected elements */}
                  {isSelected && (el.type === "rect" || el.type === "ellipse" || el.type === "text") && (
                    <>
                      <rect
                        x={el.x - 4}
                        y={el.y - 4}
                        width="8"
                        height="8"
                        fill="#3B82F6"
                        className="cursor-nw-resize"
                      />
                      <rect
                        x={el.x + el.w - 4}
                        y={el.y - 4}
                        width="8"
                        height="8"
                        fill="#3B82F6"
                        className="cursor-ne-resize"
                      />
                      <rect
                        x={el.x - 4}
                        y={el.y + el.h - 4}
                        width="8"
                        height="8"
                        fill="#3B82F6"
                        className="cursor-sw-resize"
                      />
                      <rect
                        x={el.x + el.w - 4}
                        y={el.y + el.h - 4}
                        width="8"
                        height="8"
                        fill="#3B82F6"
                        className="cursor-se-resize"
                      />
                    </>
                  )}
                </g>
              );
            })}

            {/* Marquee selection */}
            {marqueeRect && (
              <rect
                x={marqueeRect.x}
                y={marqueeRect.y}
                width={marqueeRect.w}
                height={marqueeRect.h}
                fill="rgba(59, 130, 246, 0.1)"
                stroke="#3B82F6"
                strokeWidth="1"
                strokeDasharray="4"
              />
            )}

            {/* Current pen stroke being drawn */}
            {isDrawingPen && currentPenPoints.length > 1 && (
              <polyline
                points={currentPenPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                stroke={currentStyle.strokeColor}
                strokeWidth={currentStyle.strokeWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.7"
              />
            )}
          </g>
        </svg>
      </div>
    </div>
  );
});

export default Whiteboard;
