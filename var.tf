variable "project_id" {
  description = "GCP 프로젝트 ID"
  type        = string
}

variable "region" {
  description = "GCP 리전"
  type        = string
}

variable "zone" {
  description = "GCP 존"
  type        = string
}

variable "db_password" {
  description = "PostgreSQL 데이터베이스 비밀번호"
  type        = string
  sensitive   = true
}
