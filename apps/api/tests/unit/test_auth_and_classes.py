import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.base_class import Base
from app.db.session import engine


@pytest_asyncio.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_health_check():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_register_and_login():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Register teacher
        reg_payload = {
            "email": "teacher@example.com",
            "password": "Password123!",
            "full_name": "Nguyen Van A",
            "role": "teacher"
        }
        res = await ac.post("/api/v1/auth/register", json=reg_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["email"] == "teacher@example.com"
        assert data["role"] == "teacher"
        assert "access_token" in data
        
        # Login
        login_payload = {
            "email": "teacher@example.com",
            "password": "Password123!"
        }
        login_res = await ac.post("/api/v1/auth/login", json=login_payload)
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        
        # Get profile
        me_res = await ac.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_res.status_code == 200
        assert me_res.json()["full_name"] == "Nguyen Van A"


@pytest.mark.asyncio
async def test_class_creation_and_enrollment():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Create Teacher
        t_res = await ac.post("/api/v1/auth/register", json={
            "email": "teacher2@example.com",
            "password": "Password123!",
            "full_name": "Thay Giao B",
            "role": "teacher"
        })
        t_token = t_res.json()["access_token"]
        
        # 2. Teacher creates Class
        c_res = await ac.post(
            "/api/v1/classes",
            json={"name": "Lop 10A1"},
            headers={"Authorization": f"Bearer {t_token}"}
        )
        assert c_res.status_code == 200
        class_data = c_res.json()
        assert class_data["name"] == "Lop 10A1"
        code = class_data["code"]
        
        # 3. Create Student
        s_res = await ac.post("/api/v1/auth/register", json={
            "email": "student1@example.com",
            "password": "Password123!",
            "full_name": "Hoc Sinh C",
            "role": "student"
        })
        s_token = s_res.json()["access_token"]
        
        # 4. Student enrolls
        enr_res = await ac.post(
            "/api/v1/classes/enroll",
            json={"code": code},
            headers={"Authorization": f"Bearer {s_token}"}
        )
        assert enr_res.status_code == 200
        assert enr_res.json()["student_count"] == 1
