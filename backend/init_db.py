import os
from database.connection import engine, Base
from models import models

print(f"Initializing database using URL: {os.getenv('DATABASE_URL')}")
Base.metadata.create_all(bind=engine)
print("Tables created successfully!")
