# Sleekly Frontend

This is the Next.js frontend for Sleekly, serving a modern, glassmorphic visual workspace.

## Tech Stack
- **Framework**: Next.js 16 (Standalone output mode)
- **Styling**: Vanilla CSS with CSS Variables for theme management.
- **State Management**: React Context & Hooks.
- **Canvas Rendering**: Custom absolute positioning with drag-and-drop.

## Development

### Requirements
- Node.js 20+
- npm

### Local Setup
1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Set up environment variables in `.env.local`:
    ```env
    NEXT_PUBLIC_API_URL=http://localhost:8080
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```

## Project Structure
- `/src/components`: Reusable UI components (Cards, Canvas, Sidebar).
- `/src/app`: Next.js App Router pages and layouts.
- `/public`: Static assets.

For the full 3-tier architecture and deployment instructions, please refer to the [Root README](../README.md).

