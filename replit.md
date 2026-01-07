# World Cup Fan Transformation App

## Overview

This is a mobile-first web application that transforms user photos into World Cup-themed fan portraits. Users select their favorite national team (Mexico, USA, Canada, Spain, England, Brazil, Argentina, or Portugal), take or upload a selfie, and receive an AI-generated image showing them as a passionate fan in a stadium wearing their team's jersey. The app preserves the user's facial identity while transforming clothing and background.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: React Context API for app-wide state (selected team, captured image, transformed image, processing status)
- **Data Fetching**: TanStack React Query for server state management
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens for World Cup theme colors

### User Flow Implementation
The app follows a 5-screen progressive flow:
1. **Welcome** (`/`) - Hero screen with trophy and branding
2. **Team Selection** (`/seleccionar-equipo`) - Visual grid of 8 national teams
3. **Capture** (`/captura`) - Camera interface with selfie/upload options
4. **Processing** (`/procesando`) - Loading state during AI transformation
5. **Result** (`/resultado`) - Final image with download/share options

### Backend Architecture
- **Runtime**: Node.js with Express
- **API Pattern**: RESTful endpoints under `/api`
- **Build System**: Vite for frontend, esbuild for server bundling
- **Database ORM**: Drizzle ORM with PostgreSQL

### AI Integration Pipeline
The transformation uses a two-step AI process:
1. **Prompt Generation**: Gemini 3 Flash generates detailed image transformation prompts based on selected team
2. **Image Transformation**: The generated prompt guides the image editing to add team jersey and stadium background while preserving facial features

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema**: Users table and Transformations table (stores team, original image URL, result image URL, timestamps)
- **Admin Gallery**: Hidden route (`/admin-secreto`) displays all saved transformations

## External Dependencies

### AI Services
- **Google Gemini AI** (via Replit AI Integrations): Used for prompt generation and image transformation
  - Environment variables: `AI_INTEGRATIONS_GEMINI_API_KEY`, `AI_INTEGRATIONS_GEMINI_BASE_URL`
  - Models: `gemini-3-flash-preview` for text, `gemini-2.5-flash-image` for images

### Database
- **PostgreSQL**: Primary data store
  - Environment variable: `DATABASE_URL`
  - Managed through Drizzle Kit migrations

### Frontend Libraries
- **Radix UI**: Accessible component primitives
- **Lucide React**: Icon library
- **embla-carousel-react**: Carousel functionality

### Development Tools
- **Vite**: Frontend dev server and bundler with HMR
- **Replit plugins**: Runtime error overlay, cartographer, dev banner