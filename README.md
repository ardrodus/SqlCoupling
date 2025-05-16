# SQL Dependency Analyzer

A desktop application built with Angular and Electron for analyzing cross-domain dependencies between SQL stored procedures in a directory structure.

## Overview

The SQL Dependency Analyzer helps database developers identify and visualize dependencies between SQL stored procedures, with a focus on cross-domain dependencies. It analyzes SQL files using naming conventions and dependency detection to create a visual graph of directory-level dependencies.

## Features

- **SQL Procedure Analysis**: Scans directories containing SQL stored procedure files
- **Dependency Detection**: Identifies procedure calls between files using regex pattern matching
- **Cross-Domain Tracking**: Highlights dependencies between different domains (marked by prefix conventions)
- **Directory-Level Visualization**: Displays dependencies as a hierarchical graph between directories
- **Interactive Graph**: Zoom, pan, and explore the dependency graph
- **Filtering Options**: Toggle between viewing all dependencies or only cross-domain dependencies
- **Detailed Reporting**: Shows lists of procedures and their dependencies

## Technical Architecture

- **Frontend**: Angular 15.x
- **Visualization**: vis-network library for interactive graph visualization
- **Desktop App**: Electron for cross-platform desktop capabilities
- **File Handling**: Node.js APIs (via Electron) for file system access

## Requirements

- Node.js 14+
- Angular CLI 15.x
- Electron 36.x

## Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Build and run the Electron app:
   ```
   npm run electron-dev
   ```

## Usage

1. Launch the application
2. Click "Select Directory and Analyze SQL" 
3. Choose a directory containing SQL stored procedure files
4. Toggle "Show All Dependencies" to view all or only cross-domain dependencies
5. Explore the graph and detailed information in the tables below
6. Use "Debug Calls" on specific procedures to see their dependencies

## SQL Naming Conventions

The analyzer works best with SQL files following these naming conventions:
- Filename pattern: `XX_ProcedureName_SP.sql` where XX is a 2-letter domain code
- Procedure name inside file matches the filename

## Development

Run in development mode:
```
npm run electron-dev
```

Build the application:
```
npm run build
```

## Angular Development Commands

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`.

Run `ng generate component component-name` to generate a new component.

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## License

[Include your license information here]