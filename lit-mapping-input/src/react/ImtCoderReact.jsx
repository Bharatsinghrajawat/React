import React from "react";
import { createComponent } from "@lit-labs/react";
import "./imt-coder.js";

const ImtCoderReact = createComponent({
  react: React,
  tagName: "imt-coder",
  elementClass: customElements.get("imt-coder"),
  events: {
    onOpenMappingModal: "open-mapping-modal",
    onChange: "change",
    onCoderFocus: "coder-focus",
    onCoderBlur: "coder-blur",
  },
});

export default ImtCoderReact;
