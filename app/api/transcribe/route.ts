import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const audioFile = formData.get('audio') as File

  if (!audioFile) {
    return NextResponse.json({ error: 'No audio file' }, { status: 400 })
  }

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en',
    })

    return NextResponse.json({ text: transcription.text })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Transcription failed' }, { status: 500 })
  }
}
