import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// POST /api/inventory/identify — use Vision to identify equipment from a photo
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const image = formData.get('image') as File

  if (!image) return NextResponse.json({ error: 'No image' }, { status: 400 })

  const buffer = Buffer.from(await image.arrayBuffer())
  const base64 = buffer.toString('base64')
  const mimeType = image.type || 'image/jpeg'

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'This is a photo of medical/perfusion equipment packaging. Identify the product name and any relevant details (size, model, manufacturer). Respond with ONLY the product name in a short, clear format. If you cannot identify it, say "Unknown item".'
          },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` }
          }
        ]
      }]
    })

    const name = response.choices[0]?.message?.content?.trim() || 'Unknown item'
    return NextResponse.json({ itemName: name })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Vision failed' }, { status: 500 })
  }
}
