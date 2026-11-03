import sqlite3
import google.generativeai as genai

conn = sqlite3.connect(r'C:\ANJUN\Banco de Dados\torre_anjun.db')
c = conn.cursor()
c.execute("SELECT valor FROM app_config WHERE chave='gemini_api_key'")
row = c.fetchone()
key = row[0] if row else None
print('Key found:', bool(key))

if key:
    try:
        genai.configure(api_key=key)
        # test available models
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print('Available model:', m.name)
                break
        model = genai.GenerativeModel('gemini-1.5-flash')
        res = model.generate_content('Diga ola em uma frase curta')
        print('Gemini response:', res.text)
    except Exception as e:
        print('Gemini error:', e)
