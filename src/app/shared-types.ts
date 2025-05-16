// src/app/shared-types.ts
import { Node as VisNode, Edge as VisEdge } from 'vis-network/standalone/esm/vis-network';

// Extended Node interface with all required properties
export interface Node extends VisNode {
  // Common properties
  isVirtual?: boolean; // Flag for virtual nodes (not directly scanned directories)
  
  // Visual styling properties
  borderWidth?: number;
  borderDashes?: number[];
  margin?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  icon?: {
    face?: string;
    code?: string;
    size?: number;
    color?: string;
  };
  font?: {
    color?: string;
    size?: number;
    face?: string;
    background?: string;
    strokeWidth?: number;
    multi?: boolean | string;
  };
}

// Extended Edge interface
export interface Edge extends VisEdge {
  isCrossDomain?: boolean; // Flag for edges that cross domain boundaries
}