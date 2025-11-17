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
          const shapeIds = editor.getCurrentPageShapeIds();

          if (shapeIds.size === 0) {
            return "";
          }

          // Export to PNG using tldraw v4 API
          const result = await editor.toImage([...shapeIds], {
            format: 'png',
            background: true,
            scale: 1,
          });

          if (!result || !result.blob) {
            return "";
          }

          // Convert blob to base64 data URL
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve(reader.result as string);
            };
            reader.onerror = reject;
            reader.readAsDataURL(result.blob);
          });
        } catch (error) {
          console.error("Error exporting canvas:", error);
          return "";
        }
      },
      reset: () => {
        if (editorRef.current) {
          const editor = editorRef.current;
          const shapeIds = editor.getCurrentPageShapeIds();

          if (shapeIds.size > 0) {
            editor.deleteShapes([...shapeIds]);
          }

          // Reset zoom to default
          editor.resetZoom();
          editor.zoomToFit({ animation: { duration: 0 } });
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
          case "draw":
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

        console.log("[TldrawWhiteboard] Editor mounted successfully");

        // Initial summary
        setTimeout(() => updateSummary(), 100);

        // Register side effects to monitor shape changes
        const cleanupCreate = editor.sideEffects.registerAfterCreateHandler("shape", () => {
          updateSummary();
        });

        const cleanupChange = editor.sideEffects.registerAfterChangeHandler("shape", () => {
          updateSummary();
        });

        const cleanupDelete = editor.sideEffects.registerAfterDeleteHandler("shape", () => {
          updateSummary();
        });

        // Cleanup function (though not used in forwardRef, good practice)
        return () => {
          cleanupCreate();
          cleanupChange();
          cleanupDelete();
        };
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
