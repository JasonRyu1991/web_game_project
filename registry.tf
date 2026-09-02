resource "google_artifact_registry_project_config" "config" {
  location = var.region
  platform_logs_config {
    logging_state  = "ENABLED"
    severity_level = "INFO"
  }
}

resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = "web-game-images"
  description   = "web-game-image repository"
  format        = "DOCKER"
}

# resource "google_artifact_registry_rule" "artifact_registry_rule" {}
