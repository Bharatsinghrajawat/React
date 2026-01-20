/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from "react";
import { Box } from "@mui/material";
import ImtCoderReact from "../Common/lit/ImtCoderReact";


function extractKeys(obj, prefix = "", keySet = new Set()) {
  for (let key in obj) {
    let fullKey = prefix ? `${prefix}.${key}` : key;
    keySet.add(fullKey);
    if (typeof obj[key] === "object" && obj[key] !== null) {
      extractKeys(obj[key], fullKey, keySet);
    }
  }
  return keySet;
}

const MyCodeMirror = ({
  onClick,
  value,
  actualValue,
  onChange,
  data,
  setCursorPosition,
  isModalOpen,
  editorRef,
  editorContainerRef,
  onBlur,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isEditing, setEditing] = useState(false);
  // const handleFocus = () => setIsFocused(true);
  const handleBlur = () => setIsFocused(false);
  const handleFocus = () => {
  setIsFocused(true);
  editorRef.current?.focus(); // 🔥 CRITICAL
  onClick();
  setEditing(true);
};

  useEffect(() => {
    if (isModalOpen && isEditing && editorRef.current) {
      requestAnimationFrame(() => {
        editorRef.current.focus();
      });
    }
    if (!isModalOpen && !editorRef.current) {
      setEditing(false);
    }
  }, [isModalOpen, isEditing, editorRef.current]);

  useEffect(() => {
    const editorLines = document.querySelectorAll(".cm-activeLine.cm-line");
    editorLines.forEach((line) => {
      if (line.textContent.trim() === "") {
        line.style.padding = "0 !important";
      } else {
        line.style.padding = ""; // Reset to default if there is content
      }
    });
  }, [value]); // Runs when the value changes

  const handleEditorChange = (newValue) => {
    onChange(newValue);
  };
  // Function to format value for display when not focused
  const formatDisplayValue = (str = "") => {
    if (!str || typeof str !== "string") return str; // Keep numbers/booleans as is

    // Skip formatting if the string is a decimal number (e.g., "2.2", "3.14")
    if (!isNaN(str) && str.includes(".")) {
      return str; // Return as is if it's a decimal number
    }

    // Check if the string is a function call
    const functionMatch = str.match(/^\$(\w+)\((.*)\)$/);
    if (functionMatch) {
      const functionName = functionMatch[1]; // e.g., "append"
      const args = functionMatch[2].split(/,\s*/); // Split arguments

      // Format each argument using the old logic
      const formattedArgs = args.map((arg) => {
        // Skip formatting for decimal numbers inside functions
        if (!isNaN(arg) && arg.includes(".")) {
          return arg; // Return as is
        }
        if (arg.includes("@") || arg.includes("https") || str.includes("www"))
          return arg; // Preserve emails
        const parts = arg.split(".");
        if (parts.length >= 2) {
          // Remove array brackets from the first and last segment
          parts[0] = parts[0].replace(/\[\d*\]/g, ""); // First segment
          let lastSegment = parts[parts.length - 1].replace(/\[\d*\]/g, ""); // Last segment
          return `${parts[0]}:${lastSegment}`;
        }
        return arg; // Return as is if no formatting is needed
      });

      return `$${functionName}(${formattedArgs.join(", ")})`;
    }

    // Old logic (non-function case)
    if (str.includes("@") || str.includes("https") || str.includes("www"))
      return str; // Preserve emails
    const parts = str.split(".");
    if (parts.length >= 2) {
      // Remove array brackets from the first and last segment
      parts[0] = parts[0].replace(/\[\d*\]/g, ""); // First segment
      let lastSegment = parts[parts.length - 1].replace(/\[\d*\]/g, ""); // Last segment

      return `${parts[0]}:${lastSegment}`;
    }

    return str; // Return as is if no formatting is needed
  };

  return (
    <Box
      as="div"
      className={`editorContainer ${isFocused ? "focused" : ""}`}
      ref={editorContainerRef}
    >
      <ImtCoderReact
        ref={editorRef}
        value={isFocused ? value : formatDisplayValue(value)}
        onOpenMappingModal={() => {}}
        onChange={(newValue) => handleEditorChange(newValue)}
        style={{ width: "100%" }}
        onCoderFocus={handleFocus}
        onCoderBlur={() => setIsFocused(false)}
      />
    </Box>
  );
};

export default MyCodeMirror;
