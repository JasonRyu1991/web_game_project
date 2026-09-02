resource "google_container_node_pool" "web_game_node_pool" {
  name     = "web-game-node-pool"
  location = var.zone
  cluster  = google_container_cluster.web_game_cluster.name

  autoscaling {
    min_node_count = 1
    max_node_count = 5
  }

  node_config {
    service_account = google_service_account.default.email
    machine_type    = "e2-medium"
    disk_size_gb    = 30
    disk_type       = "pd-standard"
    spot            = true
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]
    tags = ["gke-node"]
  }

}
