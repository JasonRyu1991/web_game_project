resource "google_container_cluster" "web_game_cluster" {
  name                     = "web-game-cluster"
  location                 = var.zone
  network                  = google_compute_network.web_game_network.name
  subnetwork               = google_compute_subnetwork.web_game_subnet.name
  remove_default_node_pool = true
  initial_node_count       = 1

  ip_allocation_policy {
    cluster_secondary_range_name  = "gke-pods"
    services_secondary_range_name = "gke-services"
  }
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }
  node_config {
    service_account = google_service_account.default.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]
    tags = ["gke-node"]
  }
  timeouts {
    create = "30m"
    update = "40m"
  }

  # network/subnetwork/node_config 는 GCP 표현 방식 차이와 삭제된 기본
  # 노드풀의 흔적 때문에 매번 클러스터 재생성으로 오탐지되어 무시한다.
  lifecycle {
    ignore_changes = [network, subnetwork, node_config]
  }
}
