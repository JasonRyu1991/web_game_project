# GKE 노드·앱이 쓸 기본 서비스 계정
resource "google_service_account" "default" {
  account_id   = "web-game-service-account"
  display_name = "Web Game Service Account"
}

resource "google_project_iam_member" "logging_mem" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.default.email}"
}

resource "google_project_iam_member" "monitoring_mem" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.default.email}"
}

resource "google_project_iam_member" "monitoring_viewer" {
  project = var.project_id
  role    = "roles/monitoring.viewer"
  member  = "serviceAccount:${google_service_account.default.email}"
}

resource "google_project_iam_member" "artifactregistry_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.default.email}"
}

# GitHub Actions(WIF)용 계정
resource "google_service_account" "wif_service_account" {
  account_id   = "wif-service-account"
  display_name = "Wif Service Account"
}

resource "google_project_iam_member" "wif_artifactregistry_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.wif_service_account.email}"
}

resource "google_project_iam_member" "wif_container_developer" {
  project = var.project_id
  role    = "roles/container.developer"
  member  = "serviceAccount:${google_service_account.wif_service_account.email}"
}

resource "google_service_account_iam_member" "wif_impersonate" {
  service_account_id = google_service_account.wif_service_account.name
  role                = "roles/iam.workloadIdentityUser"
  member              = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.pool.name}/attribute.repository/JasonRyu1991/web_game_project"
}
