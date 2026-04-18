from dotenv import load_dotenv
from pydantic_settings import BaseSettings

load_dotenv()


class Settings(BaseSettings):
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "fisuan"
    postgres_password: str = "1337"
    postgres_db: str = "ais_hack_1case"

    ai_base_url: str = "http://172.20.10.6:8001"
    ai_default_model: str = "minimax-m2.5:cloud"

    @property
    def database_url(self) -> str:
        return f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"


settings = Settings()
