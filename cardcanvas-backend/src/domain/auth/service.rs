use rand::Rng;
use uuid::Uuid;
use super::{models::*, repository::AuthRepository};
use crate::errors::{AppError, Result};
use crate::infrastructure::auth::create_token;

pub struct AuthService {
    repo: AuthRepository,
    jwt_secret: String,
}

impl AuthService {
    pub fn new(repo: AuthRepository, jwt_secret: String) -> Self {
        Self { repo, jwt_secret }
    }

    pub async fn register(&self, req: RegisterRequest) -> Result<(User, String, String)> {
        if req.username.len() < 3 {
            return Err(AppError::BadRequest("Username must be at least 3 characters".into()));
        }
        if req.password.len() < 4 {
            return Err(AppError::BadRequest("Password must be at least 4 characters".into()));
        }

        if self.repo.find_by_username(&req.username).await?.is_some() {
            return Err(AppError::Conflict("Username already taken".into()));
        }

        let display_name = req.display_name.unwrap_or_else(|| req.username.clone());
        let password_hash = bcrypt::hash(&req.password, bcrypt::DEFAULT_COST)
            .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

        let recovery_code: String = rand::thread_rng()
            .sample_iter(&rand::distributions::Alphanumeric)
            .take(12)
            .map(char::from)
            .collect::<String>()
            .to_uppercase();
        let recovery_hash = bcrypt::hash(&recovery_code, bcrypt::DEFAULT_COST)
            .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

        let user = self.repo.create_user(&req.username, &display_name, &password_hash, &recovery_hash).await?;
        let token = create_token(user.id, &user.username, &self.jwt_secret).map_err(|e| AppError::Internal(e))?;

        Ok((user, token, recovery_code))
    }

    pub async fn login(&self, req: LoginRequest) -> Result<(User, String)> {
        let user = self.repo.find_by_username(&req.username).await?
            .ok_or(AppError::Unauthorized)?;

        let valid = bcrypt::verify(&req.password, &user.password_hash)
            .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

        if !valid {
            return Err(AppError::Unauthorized);
        }

        let token = create_token(user.id, &user.username, &self.jwt_secret).map_err(|e| AppError::Internal(e))?;

        Ok((user, token))
    }

    pub async fn me(&self, id: Uuid) -> Result<User> {
        let user = self.repo.find_by_id(id).await?
            .ok_or(AppError::Unauthorized)?;
        Ok(user)
    }

    pub async fn reset_password(&self, req: ResetPasswordRequest) -> Result<()> {
        let user = self.repo.find_by_username(&req.username).await?
            .ok_or(AppError::BadRequest("User not found".into()))?;

        let recovery_hash = user.recovery_hash
            .ok_or(AppError::BadRequest("No recovery code set".into()))?;

        let valid = bcrypt::verify(&req.recovery_code, &recovery_hash)
            .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

        if !valid {
            return Err(AppError::BadRequest("Invalid recovery code".into()));
        }

        let new_hash = bcrypt::hash(&req.new_password, bcrypt::DEFAULT_COST)
            .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

        self.repo.update_password(user.id, &new_hash).await?;

        Ok(())
    }
}
