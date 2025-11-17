"use client";

// Import Material Web components
import "@material/web/button/filled-button.js";
import "@material/web/button/outlined-button.js";
import "@material/web/button/text-button.js";
import "@material/web/button/filled-tonal-button.js";
import "@material/web/textfield/outlined-text-field.js";
import "@material/web/textfield/filled-text-field.js";
import "@material/web/iconbutton/icon-button.js";
import "@material/web/icon/icon.js";
import "@material/web/chips/chip-set.js";
import "@material/web/chips/assist-chip.js";
import "@material/web/chips/filter-chip.js";
import "@material/web/dialog/dialog.js";
import "@material/web/fab/fab.js";
import "@material/web/progress/circular-progress.js";
import "@material/web/switch/switch.js";
import "@material/web/tabs/tabs.js";
import "@material/web/tabs/primary-tab.js";

// Material Design custom element declarations for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "md-filled-button": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          disabled?: boolean;
          type?: string;
        },
        HTMLElement
      >;
      "md-outlined-button": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          disabled?: boolean;
        },
        HTMLElement
      >;
      "md-text-button": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          disabled?: boolean;
        },
        HTMLElement
      >;
      "md-filled-tonal-button": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          disabled?: boolean;
        },
        HTMLElement
      >;
      "md-outlined-text-field": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          label?: string;
          value?: string;
          placeholder?: string;
          type?: string;
          rows?: number;
          "supporting-text"?: string;
        },
        HTMLElement
      >;
      "md-filled-text-field": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          label?: string;
          value?: string;
          placeholder?: string;
          type?: string;
        },
        HTMLElement
      >;
      "md-icon-button": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          toggle?: boolean;
          selected?: boolean;
        },
        HTMLElement
      >;
      "md-icon": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
      "md-chip-set": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
      "md-assist-chip": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          label?: string;
          elevated?: boolean;
        },
        HTMLElement
      >;
      "md-filter-chip": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          label?: string;
          selected?: boolean;
        },
        HTMLElement
      >;
      "md-dialog": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          open?: boolean;
        },
        HTMLElement
      >;
      "md-fab": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          variant?: string;
          size?: string;
          label?: string;
        },
        HTMLElement
      >;
      "md-circular-progress": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          indeterminate?: boolean;
          value?: number;
        },
        HTMLElement
      >;
      "md-switch": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          selected?: boolean;
        },
        HTMLElement
      >;
    }
  }
}

export {};
