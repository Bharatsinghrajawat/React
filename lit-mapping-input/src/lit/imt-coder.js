import { LitElement, html, css } from "lit";
import { classMap } from "lit/directives/class-map.js";

import {
  tokenizeExpression,
  joinTokens,
  isIndexEditableRange,
} from "./parser.js";

/**
 * <imt-coder>
 * A Make.com-like mapping input with token decoration and partial editability.
 *
 * Public API:
 * - property `value: string`
 * - method `insertMapping(mapping: string)`
 *
 * Events:
 * - `open-mapping-modal` when user focuses, clicks, or presses '/'
 * - `change` when internal value changes
 */
export class ImtCoder extends LitElement {
  static properties = {
    value: { type: String },
    placeholder: { type: String, attribute: "focused-placeholder" },
    disabled: { type: Boolean, reflect: true },
  };

  static styles = css`
    :host {
      display: block;
    }
    .container {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      min-height: 40px;
      padding: 6px 10px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      cursor: text;
      gap: 4px;
      line-height: 24px;
      font-size: 14px;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto,
        Helvetica, Arial;
      background: white;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      background: rgba(111, 122, 145, 0.1);
      color: var(--mui-palette-cancelBtnText);
      border-radius: 6px;
      padding: 2px 8px;
      gap: 2px;
      user-select: none;
    }
    .pill.compound {
      padding: 2px 0;
    }
    .pill .seg {
      padding: 2px 0px;
    }
    .pill .seg.static {
      pointer-events: auto;
    }
    .pill .seg.index {
      background: white;
      color: #111827;
      border-radius: 4px;
      min-width: 24px;
      padding: 2px 8px;
      margin: 0 2px;
      display: inline-block;
      text-align: center;
    }
    .pill .seg.index:empty::after {
      content: "\u200B";
      display: inline-block;
    }
    .input-fragment {
      min-width: 6px;
      outline: none;
    }
    .spacer {
      display: inline-block;
      min-width: 2px;
      outline: none;
      color: transparent;
      caret-color: #111827;
    }
    .spacer:focus {
      min-width: 20px;
      background: rgba(0, 0, 0, 0.02);
      border-radius: 2px;
    }
    .ghost {
      color: #9ca3af;
    }
    .caret-capture {
      outline: none;
    }
    .pill .seg.bracket {
      background: transparent;
      color: #111827;
      padding: 0 2px;
    }
  `;

  constructor() {
    super();
    this.value = "";
    this._tokens = [];
    this._lastSelection = null;
    this._isUpdating = false;
    this._pendingUpdate = null;
    this._editingElements = new Set(); // Track which elements are being edited
    this._skipReparse = false; // Flag to skip re-parsing when manually updating tokens
    this._manualTokenUpdate = false; // Track if tokens were manually updated
    this._tokenSnapshot = null; // Snapshot of tokens before manual update
  }

  get _textBeforeAfter() {
    // Convert tokens back to text with decorations stripped
    return joinTokens(this._tokens);
  }

  firstUpdated() {
    this._parseToTokens();
    this.addEventListener("keydown", this._onKeyDown.bind(this));
    this.addEventListener("click", this._onClick.bind(this));
    // Initialize contenteditable elements
    this.updateComplete.then(() => {
      this._syncContenteditableElements();
    });
  }

  willUpdate(changed) {
    if (changed.has("value")) {
      // Always skip re-parsing if we're manually updating tokens
      if (this._skipReparse || this._isUpdating || this._manualTokenUpdate) {
        // Skip re-parsing - tokens are already correct
        return;
      }

      // Check if the new value matches what our current tokens would produce
      // This prevents unnecessary re-parsing when React passes the value back
      const currentValue = joinTokens(this._tokens);
      if (this.value === currentValue && this._tokens.length > 0) {
        // Value matches our tokens exactly - no need to re-parse
        return;
      }

      // If value is different, check if re-parsing would produce same tokens
      // This handles cases where React passes value back after our update
      const wouldProduceValue = joinTokens(this._tokens);
      if (this.value === wouldProduceValue) {
        // The incoming value matches what our tokens produce - skip re-parse
        return;
      }

      // Only re-parse if value came from external source and is truly different
      this._parseToTokens();
    }
  }

  updated(changedProperties) {
    if (changedProperties.has("value")) {
      if (
        this._pendingUpdate === null &&
        !this._isUpdating &&
        !this._manualTokenUpdate
      ) {
        // Value was updated externally (not from user input)
        // Manually sync contenteditable elements to match new tokens
        this.updateComplete.then(() => {
          this._syncContenteditableElements();
        });
      }
      // Don't reset _isUpdating here if we're manually updating tokens
      // It will be reset in the spacer blur handler
      if (!this._manualTokenUpdate) {
        this._isUpdating = false;
      }
    }
  }

  _syncContenteditableElements() {
    // Update contenteditable index segments from token model
    // Only update if value changed externally (user isn't currently editing)
    const indexElements =
      this.shadowRoot?.querySelectorAll('[data-seg="index"]');
    if (!indexElements) return;

    indexElements.forEach((el) => {
      // Skip if this element is currently being edited
      if (this._editingElements.has(el)) {
        return;
      }

      const pillIndex = Number(el.getAttribute("data-pill-index"));
      const segmentIndex = Number(el.getAttribute("data-segment-index"));
      if (
        pillIndex >= 0 &&
        segmentIndex >= 0 &&
        pillIndex < this._tokens.length
      ) {
        const token = this._tokens[pillIndex];
        if (token && token.segments && segmentIndex < token.segments.length) {
          const expectedText = token.segments[segmentIndex].text || "";
          const currentText = el.textContent ?? "";
          // Only update if text is different and element is not focused
          if (expectedText !== currentText && document.activeElement !== el) {
            el.textContent = expectedText;
          }
        }
      }
    });
  }

  _parseToTokens() {
    // If we have manually inserted tokens, try to preserve their order
    if (this._manualTokenUpdate && this._tokens.length > 0) {
      // Don't re-parse if we're manually updating - tokens are already correct
      return;
    }

    const parsedTokens = tokenizeExpression(this.value ?? "");

    // If we have manually inserted tokens with metadata, try to preserve their positions
    if (this._tokens.some((t) => t._insertedAt !== undefined)) {
      // Merge parsed tokens with manually inserted ones, preserving order
      // For now, just use parsed tokens but this is a fallback
      this._tokens = parsedTokens;
      // Clear insertion metadata since we've re-parsed
      this._tokens.forEach((t) => {
        delete t._insertedAt;
        delete t._insertionTime;
      });
    } else {
      this._tokens = parsedTokens;
    }
  }

  _parseMappingToken(text) {
    // Parse a mapping string (like "CRM.contacts[]") into a token structure
    // This matches the structure created by parseMapping in parser.js
    const segments = [];
    let i = 0;
    let currentPart = "";

    while (i < text.length) {
      const ch = text[i];

      if (ch === "[") {
        if (currentPart) {
          segments.push({ text: currentPart, kind: "static" });
          currentPart = "";
        }
        segments.push({ text: "[", kind: "static" });
        i++;
        let indexContent = "";
        while (i < text.length && text[i] !== "]") {
          indexContent += text[i];
          i++;
        }
        if (i < text.length) {
          segments.push({
            text: indexContent.replace(/[^0-9]/g, ""),
            kind: "index",
          });
          segments.push({ text: "]", kind: "static" });
          i++;
        }
      } else if (ch === ".") {
        if (currentPart) {
          segments.push({ text: currentPart, kind: "static" });
          currentPart = "";
        }
        segments.push({ text: ".", kind: "static" });
        i++;
      } else if (/[A-Za-z0-9_]/.test(ch)) {
        currentPart += ch;
        i++;
      } else {
        break;
      }
    }

    if (currentPart) {
      segments.push({ text: currentPart, kind: "static" });
    }

    if (segments.length === 0) return null;

    return {
      kind: "mapping",
      type: "path",
      raw: text,
      segments,
    };
  }

  focus() {
    const el = this.renderRoot?.querySelector('[data-role="editable-root"]');
    if (el) el.focus();
  }

  insertMapping(mapping) {
    if (!mapping) return;
    const insertion = ` ${mapping} `;
    const sel = window.getSelection();
    const rangeText = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    const current = this.value ?? "";
    if (
      rangeText &&
      this.shadowRoot &&
      this.shadowRoot.contains(rangeText.startContainer)
    ) {
      // Best-effort: append to end if selection is inside the component.
      this.value = `${current}${current ? " " : ""}${mapping}`;
    } else {
      this.value = `${current}${current ? " " : ""}${mapping}`;
    }
    this._notifyChange();
  }

  _notifyChange() {
    this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  }

  _onClick() {
    // Emit open event when clicking background area to show modal
    this.dispatchEvent(
      new CustomEvent("open-mapping-modal", { bubbles: true, composed: true })
    );
  }

  _onKeyDown(e) {
    if (e.key !== "Backspace") return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }
    if (!node) return;
    console.log("_onKeyDown node - ", node);
    // ✅ Allow delete inside index
    if (node.closest('[data-seg="index"]')) return;

    // ✅ Caret in spacer → delete previous pill
    if (node.classList.contains("spacer")) {
      const afterIndex = Number(node.getAttribute("data-spacer-after"));

      e.preventDefault();

      if (afterIndex >= 0) {
        // Spacer after a pill → delete that pill
        this._removePillAt(afterIndex);
      } else {
        // 🔥 Spacer before first pill → delete first pill
        this._removePillAt(0);
      }
      return;
    }

    // ✅ Caret on pill → delete pill
    const pillEl = node.closest("[data-pill-index]");
    if (pillEl) {
      e.preventDefault();
      this._removePillAt(Number(pillEl.getAttribute("data-pill-index")));
    }
  }

  _findActiveSegment() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    let node = sel.getRangeAt(0).startContainer;

    // Normalize text node → element
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }
    if (!node) return null;
    console.log("_findActiveSegment node - ", node);
    const pillEl = node.closest("[data-pill-index]");
    if (!pillEl) return null;

    const pillIndex = Number(pillEl.getAttribute("data-pill-index"));

    // ✅ CORRECT: inside index if ANY ancestor is index
    const insideIndex = !!node.closest('[data-seg="index"]');

    return {
      kind: "pill",
      pillIndex,
      insideIndex,
    };
  }

  _removePillAt(index) {
    const t = [...this._tokens];
    const target = t[index];
    if (!target) return;
    t.splice(index, 1);
    this._tokens = t;
    const newValue = joinTokens(this._tokens);
    this._isUpdating = false;
    if (this._pendingUpdate) {
      clearTimeout(this._pendingUpdate);
      this._pendingUpdate = null;
    }
    this.value = newValue;
    this._notifyChange();
  }

  _renderPill(token, pillIndex) {
    // Token carries structure: { type:'mapping'|'function', segments: Array<{text, kind: 'static'|'index', editable:boolean}> }
    const classes = {
      pill: true,
      compound: token.segments && token.segments.length > 1,
    };
    return html`
      <span
        class=${classMap(classes)}
        data-pill-index=${pillIndex}
        contenteditable="false"
      >
        ${token.segments.map((seg, i) => {
          const segClasses = {
            seg: true,
            static: seg.kind === "static",
            index: seg.kind === "index",
            bracket: seg.kind === "bracket",
          };

          const editable = seg.kind === "index";
          // For editable segments, track editing state to prevent conflicts
          if (editable) {
            return html`<span
              class=${classMap(segClasses)}
              data-seg=${seg.kind}
              data-pill-index=${pillIndex}
              data-segment-index=${i}
              contenteditable="true"
              @input=${(e) => this._onIndexEdit(e, pillIndex, i)}
              @focus=${(e) => this._editingElements.add(e.target)}
              @blur=${(e) => {
                this._editingElements.delete(e.target);
                this._syncValue();
              }}
              >${seg.text}</span
            >`;
          }
          return html`<span
            class=${classMap(segClasses)}
            data-seg=${seg.kind}
            contenteditable="false"
            >${seg.text}</span
          >`;
        })}
      </span>
    `;
  }

  _onIndexEdit(e, pillIndex, segmentIndex) {
    e.stopPropagation();
    const el = e.target;
    const raw = el.textContent ?? "";
    const normalized = raw.replace(/[^0-9]/g, "");
    if (raw !== normalized) {
      el.textContent = normalized;
    }
    // Update token model directly - DON'T update this.value during editing
    const token = this._tokens[pillIndex];
    if (!token) return;

    // Mark this element as being edited
    this._editingElements.add(el);

    // Update the token segment directly
    token.segments[segmentIndex].text = normalized;

    // Mark as updating to prevent willUpdate from re-parsing
    this._isUpdating = true;

    // DON'T update this.value here - only update on blur
    // This prevents Lit from re-rendering during active editing
  }

  _renderText(text, tokenIndex) {
    return html`
      <span
        class="input-fragment"
        contenteditable="true"
        data-text-index=${tokenIndex}
        @input=${(e) => this._onTextEdit(e, tokenIndex)}
        @focus=${(e) => this._editingElements.add(e.target)}
        @blur=${(e) => {
          this._editingElements.delete(e.target);
          this._syncValue();
        }}
        >${text}</span
      >
    `;
  }

  _syncValue() {
    // Immediately sync value when user leaves the field
    if (this._pendingUpdate) {
      clearTimeout(this._pendingUpdate);
      this._pendingUpdate = null;
    }
    this._isUpdating = false;
    const newValue = joinTokens(this._tokens);
    if (this.value !== newValue) {
      // Update value - this will trigger re-render, but user is done editing
      this.value = newValue;
      this._notifyChange();
    }
  }

  _onTextEdit(e, tokenIndex) {
    const el = e.target;
    const content = el.textContent ?? "";
    const t = this._tokens[tokenIndex];
    if (!t || t.kind !== "text") return;

    // Mark as being edited
    this._editingElements.add(el);

    // Check if we need to split the text token (e.g., user typed a mapping pattern)
    // For now, just update the text - splitting can be handled on blur if needed
    t.text = content;

    // Mark as updating to prevent willUpdate from re-parsing
    this._isUpdating = true;

    // DON'T update this.value here - only update on blur
    // This prevents Lit from re-rendering during active editing
  }
  _onFocusIn() {
    this.dispatchEvent(
      new CustomEvent("coder-focus", {
        bubbles: true,
        composed: true,
      })
    );
  }

  _onFocusOut(e) {
    // Prevent false blur when moving between inner editable parts
    if (this.contains(e.relatedTarget)) return;

    this.dispatchEvent(
      new CustomEvent("coder-blur", {
        bubbles: true,
        composed: true,
      })
    );
  }

_onMouseDown(e) {
  // Prevent browser from placing caret on container
  e.preventDefault();

  const root = this.renderRoot.querySelector('[data-role="editable-root"]');
  if (!root) return;

  // If clicking on a spacer → place caret there
  const targetSpacer = e.composedPath().find(
    el => el?.classList?.contains?.('spacer')
  );

  if (targetSpacer) {
    this._placeCaretInSpacer(targetSpacer);
    return;
  }

  // Otherwise → place caret in LAST spacer
  const spacers = root.querySelectorAll('.spacer');
  const lastSpacer = spacers[spacers.length - 1];
  this._placeCaretInSpacer(lastSpacer);
}


  render() {
    const hasContent =
      this._tokens.length > 0 || (this.value?.trim()?.length ?? 0) > 0;
    const tokens = this._tokens;
    return html`
      <div
        class="container"
        role="textbox"
        tabindex="0"
        aria-label="${this.placeholder}"
        data-role="editable-root"
        @mousedown=${this._onMouseDown}
        @focusin=${this._onFocusIn}
        @focusout=${this._onFocusOut}
        @focus=${() =>
          this.dispatchEvent(
            new CustomEvent("open-mapping-modal", {
              bubbles: true,
              composed: true,
            })
          )}
      >
        ${this._renderSpacer(-1)}
        ${tokens.map((t, i) => {
          const tokenEl =
            t.kind === "text"
              ? this._renderText(t.text, i)
              : this._renderPill(t, i);
          // Add spacer after each token to allow insertion between tokens
          return html`${tokenEl}${this._renderSpacer(i)}`;
        })}
        ${!hasContent
          ? html`<span
              class="ghost"
              contenteditable="false"
              style="pointer-events: none;"
              >${this.placeholder}</span
            >`
          : null}
      </div>
    `;
  }

  _renderSpacer(afterIndex) {
    return html`
      <span
        class="spacer"
        contenteditable="true"
        data-spacer-after=${afterIndex}
        @focus=${(e) => this._editingElements.add(e.target)}
        @blur=${(e) => {
          this._onSpacerBlur(e, afterIndex);
        }}
        >​</span
      >
    `;
  }

  _onSpacerBlur(e, afterIndex) {
    const el = e.target;
    let text = el.textContent?.replace(/\u200B/g, "") || "";

    this._editingElements.delete(el);

    if (!text.trim()) {
      // Empty spacer, just keep the zero-width space
      el.textContent = "\u200B";
      this._syncValue();
      return;
    }

    // Determine insertion position
    const insertIndex = afterIndex + 1;

    // Check if we should merge with adjacent text tokens
    const prevToken =
      afterIndex >= 0 && afterIndex < this._tokens.length
        ? this._tokens[afterIndex]
        : null;
    const nextToken =
      insertIndex < this._tokens.length ? this._tokens[insertIndex] : null;

    // Set flags BEFORE updating tokens to prevent re-parsing
    this._isUpdating = true;
    this._skipReparse = true;
    this._manualTokenUpdate = true; // Mark that we're manually updating tokens

    if (prevToken && prevToken.kind === "text") {
      // Merge with previous text token
      prevToken.text += text;
    } else if (nextToken && nextToken.kind === "text") {
      // Merge with next text token
      nextToken.text = text + nextToken.text;
    } else {
      // Check if the text is actually a mapping pattern (like "CRM.contacts[]")
      // If so, parse it as a mapping token instead of text token
      // This ensures it maintains its type when value gets re-parsed
      let newToken;

      // Try to parse as mapping first
      const mappingMatch = text.match(
        /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\])*)/
      );
      if (mappingMatch && mappingMatch[0] === text.trim()) {
        // It's a mapping pattern - parse it properly
        const mappingToken = this._parseMappingToken(text.trim());
        if (mappingToken) {
          newToken = mappingToken;
        } else {
          // Fallback to text token
          newToken = { kind: "text", text: text };
        }
      } else {
        // Regular text token
        newToken = { kind: "text", text: text };
      }

      // Mark with insertion metadata to preserve order
      newToken._insertedAt = insertIndex;
      newToken._insertionTime = Date.now();

      this._tokens.splice(insertIndex, 0, newToken);

      // Verify insertion was correct
      if (this._tokens[insertIndex] !== newToken) {
        console.warn("Token insertion order mismatch!");
        // Force correct position
        const actualIndex = this._tokens.indexOf(newToken);
        if (actualIndex !== insertIndex && actualIndex !== -1) {
          // Remove from wrong position and insert at correct position
          this._tokens.splice(actualIndex, 1);
          this._tokens.splice(insertIndex, 0, newToken);
        }
      }
    }

    if (!el.textContent || el.textContent === "") {
      el.textContent = "\u200B";
    }

    // Store the expected value to verify later
    const expectedValue = joinTokens(this._tokens);

    // Request update - willUpdate will see flags and skip re-parsing
    // This renders the new token in the correct position
    this.requestUpdate();

    // Update the value asynchronously after render completes
    // Use a longer delay to ensure DOM is fully updated
    this.updateComplete.then(() => {
      // Double-check tokens are still in correct order
      const currentValue = joinTokens(this._tokens);

      // Only update if value doesn't match AND tokens are still correct
      if (this.value !== currentValue && currentValue === expectedValue) {
        // Update value - flags are still set so willUpdate won't re-parse
        this.value = currentValue;
        this._notifyChange();
      }

      // Keep flags set for an extended period to prevent any re-parsing
      // This ensures React's update cycle completes without triggering re-parse
      setTimeout(() => {
        // Verify tokens are still correct before clearing flags
        const finalValue = joinTokens(this._tokens);
        if (finalValue === expectedValue) {
          this._isUpdating = false;
          this._skipReparse = false;
          this._manualTokenUpdate = false;
        } else {
          // Tokens were modified, keep flags set longer
          setTimeout(() => {
            this._isUpdating = false;
            this._skipReparse = false;
            this._manualTokenUpdate = false;
          }, 200);
        }
      }, 300);
    });
  }
  _placeCaretInFirstSpacer() {
    const spacer = this.renderRoot.querySelector(".spacer");
    if (!spacer) return;

    const range = document.createRange();
    range.selectNodeContents(spacer);
    range.collapse(true);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  _placeCaretInSpacer(spacer) {
    if (!spacer) return;

    spacer.focus();

    const range = document.createRange();
    range.selectNodeContents(spacer);
    range.collapse(true);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

customElements.define("imt-coder", ImtCoder);
