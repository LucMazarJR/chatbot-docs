import os
from google import genai
from google.genai import types

from dotenv import load_dotenv

def gerarEmbedding(question):
    if not question or not question.strip():
        raise ValueError("Question não pode estar vazio")
    
    load_dotenv()
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    
    try:
        result = client.models.embed_content(
            model="gemini-embedding-001",
            contents=question,
            config=types.EmbedContentConfig(task_type="SEMANTIC_SIMILARITY", output_dimensionality=3072)
        )
        return result
    finally:
        client.close()