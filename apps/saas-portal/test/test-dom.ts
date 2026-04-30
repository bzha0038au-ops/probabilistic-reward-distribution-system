import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const activeRoots = new Set<Root>();
const activeContainers = new Set<HTMLElement>();

export const installTestDom = () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: dom.window.HTMLElement,
  });
  Object.defineProperty(globalThis, "Node", {
    configurable: true,
    value: dom.window.Node,
  });
  Object.defineProperty(globalThis, "MutationObserver", {
    configurable: true,
    value: dom.window.MutationObserver,
  });
  Object.defineProperty(globalThis, "FormData", {
    configurable: true,
    value: dom.window.FormData,
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 0),
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    writable: true,
    value: (handle: number) => clearTimeout(handle),
  });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
    writable: true,
  });

  return () => {
    dom.window.close();
  };
};

export const renderTestComponent = (element: React.ReactElement) => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const root = createRoot(container);
  activeRoots.add(root);
  activeContainers.add(container);

  act(() => {
    root.render(
      element as unknown as Parameters<Root["render"]>[0],
    );
  });

  return {
    container,
    rerender(nextElement: React.ReactElement) {
      act(() => {
        root.render(
          nextElement as unknown as Parameters<Root["render"]>[0],
        );
      });
    },
    unmount() {
      if (!activeRoots.has(root)) {
        return;
      }

      act(() => {
        root.unmount();
      });
      activeRoots.delete(root);
      activeContainers.delete(container);
      container.remove();
    },
  };
};

export const cleanupComponents = () => {
  for (const root of activeRoots) {
    act(() => {
      root.unmount();
    });
  }
  activeRoots.clear();

  for (const container of activeContainers) {
    container.remove();
  }
  activeContainers.clear();
  document.body.innerHTML = "";
};
