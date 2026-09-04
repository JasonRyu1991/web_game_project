# GitHub Actions OIDC → GCP 임퍼서네이션용 WIF 풀
resource "google_iam_workload_identity_pool" "pool" {
  workload_identity_pool_id = "workload-identity-pool"
}

resource "google_iam_workload_identity_pool_provider" "pool_provider" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "workloadi-identity-pool-provider"
  oidc {
  issuer_uri = "https://token.actions.githubusercontent.com"
  }
  attribute_mapping = {
    "google.subject" = "assertion.sub"
    "attribute.actor" = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }
  attribute_condition = "attribute.repository == 'JasonRyu1991/web_game_project'"
}
