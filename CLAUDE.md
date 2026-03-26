@AGENTS.md
# COR - Cardiovascular Perfusion AI Assistant

## Project Overview
A specialized AI chatbot for cardiovascular perfusionists built with Next.js, deployed on Vercel.
Live URL: perfusion-bot.vercel.app

## Tech Stack
- Framework: Next.js 16.2 (app router)
- Database: Supabase (pgvector for embeddings, postgres for data)
- AI: Anthropic Claude API (model: claude-sonnet-4-6)
- Embeddings: OpenAI text-embedding-3-small
- Deployment: Vercel (auto-deploys from GitHub on push)
- Repo: https://github.com/ccp-bot/Perfusion-Bot-

## Project Structure
- app/page.tsx — main chat UI
- app/api/chat/route.ts — RAG pipeline (embed question → search Supabase → Claude)
- app/layout.tsx — root layout (dark background #0f1117)
- public/ — images and videos for COR robots
- upload-pdf.mjs — script to upload PDFs to Supabase knowledge base

## COR Robot Characters
- COR-1.PNG — main COR robot (waving, used in header and chat)
- COR-Bot.PNG — COR running (thinking animation)
- COR-Tank.PNG — COR-T tank robot (thinking animation)
- COR-Aircraft.PNG — COR-H hovering robot (thinking animation)
- COR-Wave-3.mp4 — COR waving video (splash screen)
- COR-Hovering-GIF.gif — COR-H animated hovering (in progress - background removal issue)

## Knowledge Base
Supabase documents table with 59+ chunks from:
- 2023 AmSECT Standards & Guidelines
- AmSECT MCS Standards 2016
- DO2 Reference Chart
- Orientation and Onboarding Template
- Pediatric Standards & Guidelines 2025
- Supply Management Resource
- Adult CPB folder
- ECMO folder
- Peds CPB folder

## Current Features
- Splash screen: COR waving video fullscreen, fades to chat after 5-6 seconds
- Chat interface: dark theme (#0f1117), red accent (#e63946)
- Thinking animation: 3 robots run/fly across screen while waiting for answer
- Idle state: 3 robots standing at bottom bobbing gently
- COR personality: friendly, truth-seeking, uses bullet points

## Current Issue Being Worked On
- COR-Hovering-GIF.gif has white background — trying to make transparent
- Need to remove white background from GIF without losing the blue flame effect

## Environment Variables (in .env.local)
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- OPENAI_API_KEY
- ANTHROPIC_API_KEY

## Business Context
- This is a proof of concept for an AI agency business
- Target users: cardiovascular perfusionists
- Future plans: iOS/Android app, case log feature, institution-specific memory
- Cost: ~$0.01-0.05 per conversation (Anthropic API)