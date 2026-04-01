@AGENTS.md
# COR - Cardiovascular Perfusion AI Assistant

## Project Overview
A specialized AI chatbot for cardiovascular perfusionists built with Next.js, deployed on Vercel.
Live URL: perfusion-bot.vercel.app
Repo: https://github.com/ccp-bot/Perfusion-Bot-

## Tech Stack
- Framework: Next.js 16.2 (app router)
- Database: Supabase (pgvector for embeddings, postgres for data)
- AI: Anthropic Claude API (model: claude-sonnet-4-6)
- Embeddings: OpenAI text-embedding-3-small
- Deployment: Vercel (auto-deploys from GitHub on push)

## Project Structure
- app/page.tsx — main chat UI (sidebar, chat, panels, input)
- app/login/page.tsx — login page with COR waving animation
- app/api/chat/route.ts — RAG pipeline (embed question → search Supabase → Claude)
- app/api/logbook/route.ts — logbook/knowledge base CRUD
- app/api/history/route.ts — conversation history CRUD
- app/lib/supabase.ts — Supabase client
- app/layout.tsx — root layout (dark background #080b12)
- public/ — all images, GIFs, videos, icons
- upload-pdf.mjs — script to upload PDFs to Supabase knowledge base

## Supabase Tables
- documents — RAG knowledge base with pgvector embeddings
- logbook — saved knowledge entries by category (Protocol, Case Note, Equipment, Policy, Logbook)
- conversations — conversation history (auto-saves, 7-day expiry, pinnable)

## UI Design
- Color scheme: dark navy #080b12, sidebar #0d1117, red accent #e63946
- Font: SF Pro Display / system-ui
- Left sidebar (200px): COR branding + rotating heart GIF, 5 category icons
- Slide-out panel (300px): opens when sidebar icon clicked
- Input bar: + button, text input with mic inside, round send button

## COR Robot Characters & Assets
- COR-1.PNG — main COR robot (used in chat messages)
- COR-Bot.PNG — COR running (thinking animation)
- COR-Tank.PNG — COR-T tank robot (thinking animation)
- COR-Hovering-GIF.gif — COR-H hovering with transparent background (thinking animation)
- COR.Opener.mp4 — splash screen video
- CORx3Dance.gif — all 3 robots dancing (idle state on empty chat)
- LittleCorWave.gif — COR waving (login page)
- RotatingHeart.gif — rotating heart (sidebar branding)

## Sidebar Icons (all in public/)
- History.icon.png — conversation history
- Logbook.icon.png — personal logbook
- Protocol.icon.png — protocols
- Equipment.Icon.png — equipment
- Policy.Icon.png — policy
- Microphone.icon.png — mic button in input

## Current Features
- Splash screen: COR.Opener.mp4 fullscreen, fades after 5-6 seconds with mute button
- Login page: COR waving GIF on left, login form on right, modern dark design
- Chat interface: dark theme, red accent, message bubbles, COR avatar on responses
- Thinking animation: 3 robots run/fly across screen while waiting for answer
- Idle state: CORx3Dance.gif on empty chat screen
- Left sidebar navigation: History, Logbook, Protocol, Equipment, Policy
- Slide-out panels: each category shows saved entries, History shows conversations
- Conversation history: auto-saves after every response, 7-day expiry, pin to keep forever
- Voice input: Web Speech API mic inside input box, auto-restarts on timeout
- File attachments: + button opens file picker for images/videos
- Save to knowledge base: COR generates summary, user picks category
- RAG pipeline: embed question → search Supabase → Claude responds with context

## Environment Variables (in .env.local and Vercel)
- NEXT_PUBLIC_SUPABASE_URL=https://sqnosvhrvctucmvrogev.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- OPENAI_API_KEY
- ANTHROPIC_API_KEY

## Key Development Rules
- Always provide COMPLETE file replacements, never partial edits
- Import paths for lib/supabase.ts vary by file location — double check
- File naming is case-sensitive on Vercel (e.g. Equipment.Icon.png not equipment.icon.png)
- Voice/mic only works on HTTPS (Vercel), not localhost
- Auto-save history passes finalMessages directly inside sendMessage, not via useEffect
- Push to GitHub triggers auto-deploy on Vercel

## Future Features Roadmap
1. New conversation button — clear chat and start a fresh conversation
2. Logbook voice mode — talk through a case and COR summarizes with follow-up questions
3. Image analysis — upload cannulation/circuit photos for COR to analyze
4. Case log stats — track bypass times, temps, and cases per month with dashboard
5. Mobile optimization — make UI look great on phone/tablet
6. Multi-user groups with role-based access:
   - Owner (Clifton): creates groups/institutions, full control
   - Admin (Group Leader): manages shared knowledge base, edits saved info for their group
   - Worker (Perfusionist): uses chat and personal logbook, reads shared group content

## Business Context
- Proof of concept for an AI agency business targeting cardiovascular perfusionists
- Future plans: iOS/Android app, image-based cannulation analysis, institution-specific memory, multi-user institutional sales
- Cost: ~$0.01-0.05 per conversation (Anthropic API)