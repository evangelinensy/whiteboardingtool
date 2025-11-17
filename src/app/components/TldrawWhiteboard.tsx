"use client";

import React, { forwardRef, useImperativeHandle, useRef, useCallback, useEffect, useState } from "react";
import { Tldraw, Editor, TLShape } from "tldraw";

export interface WhiteboardRef {
  getCanvasImage: () => Promise<string>;
  reset: () => void;
}

interface TldrawWhiteboardProps {
  onSummaryChange: (summary: {
    elementsCount: number;
    rectanglesCount: number;
    textCount: number;
    arrowsCount: number;
    titles: string[];
  }) => void;
  onExport: (base64: string) => void;
}

const TldrawWhiteboard = forwardRef<WhiteboardRef, TldrawWhiteboardProps>(
  function TldrawWhiteboard({ onSummaryChange, onExport }, ref) {
    const editorRef = useRef<Editor | null>(null);
    const [isReady, setIsReady] = useState(false);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      getCanvasImage: async () => {
        if (!editorRef.current) {
          return "";
        }

        try {
          const editor = editorRef.current;
          const shapes = editor.getCurrentPageShapes();

          if (shapes.length === 0) {
            return "";
          }

          // Get all shape IDs
          const shapeIds = shapes.map((s) => s.id);

          // Export to SVG first
          const svg = await editor.getSvgString(shapeIds, {
            scale: 1,
            background: true,
          });

          if (!svg) {
            return "";
          }

          // Convert SVG to PNG using canvas
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return "";
          }

          // Create image from SVG
          const img = new Image();
          const svgBlob = new Blob([svg.svg], { type: "image/svg+xml" });
          const url = URL.createObjectURL(svgBlob);

          return new Promise<string>((resolve) => {
            img.onload = () => {
              canvas.width = img.width || 1200;
              canvas.height = img.height || 800;
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0);
              URL.revokeObjectURL(url);
              resolve(canvas.toDataURL("image/png"));
            };
            img.onerror = () => {
              URL.revokeObjectURL(url);
              resolve("");
            };
            img.src = url;
          });
        } catch (error) {
          console.error("Error exporting canvas:", error);
          return "";
        }
      },
      reset: () => {
        if (editorRef.current) {
          editorRef.current.selectAll();
          editorRef.current.deleteShapes(editorRef.current.getSelectedShapeIds());
          editorRef.current.zoomToFit();
        }
      },
    }));

    // Analyze shapes and update summary
    const updateSummary = useCallback(() => {
      if (!editorRef.current) return;

      const shapes = editorRef.current.getCurrentPageShapes();

      // Count different shape types
      let rectanglesCount = 0;
      let textCount = 0;
      let arrowsCount = 0;
      const titles: string[] = [];

      shapes.forEach((shape: TLShape) => {
        switch (shape.type) {
          case "geo":
            rectanglesCount++;
            break;
          case "text":
            textCount++;
            // Extract text content for titles
            if ("text" in shape.props && typeof shape.props.text === "string") {
              const text = shape.props.text.trim();
              if (text) {
                titles.push(text);
              }
            }
            break;
          case "arrow":
          case "line":
            arrowsCount++;
            break;
        }
      });

      onSummaryChange({
        elementsCount: shapes.length,
        rectanglesCount,
        textCount,
        arrowsCount,
        titles,
      });
    }, [onSummaryChange]);

    // Handle editor mount
    const handleMount = useCallback(
      (editor: Editor) => {
        editorRef.current = editor;
        setIsReady(true);

        // Initial summary
        updateSummary();

        // Register side effects to monitor shape changes
        editor.sideEffects.registerAfterCreateHandler("shape", () => {
          updateSummary();
        });

        editor.sideEffects.registerAfterChangeHandler("shape", () => {
          updateSummary();
        });

        editor.sideEffects.registerAfterDeleteHandler("shape", () => {
          updateSummary();
        });
      },
      [updateSummary]
    );

    return (
      <div style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <Tldraw onMount={handleMount} />
      </div>
    );
  }
);

export default TldrawWhiteboard;
