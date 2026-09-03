# ── core 노드풀 ──────────────────────────────────────────────
# 온디맨드(선점 안 당함) 고정 1대. redis·KEDA·시스템 파드처럼 "죽으면 안 되는 것"이 여기 산다.
# 스팟 노드가 통째로 선점당해도 이 노드가 살아있어서 전체 다운을 막는다.
resource "google_container_node_pool" "web_game_core_pool" {
  name     = "web-game-core"
  location = var.zone
  cluster  = google_container_cluster.web_game_cluster.name

  autoscaling {
    min_node_count = 1
    max_node_count = 2 # 평소엔 1대. 스팟이 다 선점당해 채널 파드가 몰릴 때만 잠깐 2대
  }

  node_config {
    service_account = google_service_account.default.email
    machine_type    = "e2-standard-2" # 2vCPU/8GB. 시스템+redis+KEDA+채널 2~3개까지 감당
    disk_size_gb    = 30
    disk_type       = "pd-standard"
    # spot 안 씀 (기본값 온디맨드) — 이 노드는 절대 안 죽는 게 존재 이유다
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]
    tags           = ["gke-node"]
    resource_labels = { pool = "core" }
    labels          = { pool = "core" } # k8s 쪽에서 nodeSelector 로 이 라벨을 본다
  }
}

# ── spot 노드풀 (기존) ───────────────────────────────────────
# KEDA 가 채널을 늘릴 때 뜨는 값싼 버스트 용량. 놀면 0대까지 내려간다.
# 스팟이라 선점당할 수 있지만, 여기 있는 건 채널 파드뿐이라 core 가 받아주면 된다.
resource "google_container_node_pool" "web_game_node_pool" {
  name     = "web-game-node-pool"
  location = var.zone
  cluster  = google_container_cluster.web_game_cluster.name

  autoscaling {
    min_node_count = 0 # 접속자 없으면 스팟 노드는 0대 = 공짜
    max_node_count = 3 # E2_CPUS 쿼터가 16이라 4는 못 간다. core(2×2) + spot(3×4=12) = 16 딱 맞춤
  }

  node_config {
    service_account = google_service_account.default.email
    machine_type    = "e2-standard-4"
    disk_size_gb    = 30
    disk_type       = "pd-standard"
    spot            = true # GKE 가 이 노드에 cloud.google.com/gke-spot taint 를 자동으로 박는다
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]
    tags           = ["gke-node"]
    resource_labels = { pool = "spot" }
    labels          = { pool = "spot" }
  }
}
