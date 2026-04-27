// Keep the root barrel limited to cross-domain primitives. Domain contracts
// must be imported from their own entrypoints to avoid hidden coupling.
export * from "./api";
export * from "./common";
