resource "google_compute_network" "web_game_network" {
  name                    = "web-game-network"
  auto_create_subnetworks = false
} #vpc를 만들

resource "google_compute_subnetwork" "web_game_subnet" {
  name          = "web-game-subnetwork"
  ip_cidr_range = "10.0.1.0/24"
  region        = var.region
  network       = google_compute_network.web_game_network.name

  secondary_ip_range {
    range_name    = "gke-pods"
    ip_cidr_range = "10.4.0.0/20"
  }

  secondary_ip_range {
    range_name    = "gke-services"
    ip_cidr_range = "10.8.0.0/20"
  }
} #서브넷을 만들고, 서브넷 안에 GKE 파드와 서비스용으로 secondary ip range를 만들어 준다.

resource "google_compute_router" "web_game_router" {
  name    = "web-game-router"
  region  = var.region
  network = google_compute_network.web_game_network.name
}

resource "google_compute_router_nat" "web_game_nat" {
  name                               = "web-game-nat"
  router                             = google_compute_router.web_game_router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# 이 아래로부터 LB
# 게임 서버 실서비스 올릴 때가 되면 이 블록만 주석 해제하면 된다.

# resource "google_compute_backend_service" "placeholder" {
#   name                  = "web-game-placeholder-backend"
#   protocol              = "HTTP"
#   load_balancing_scheme = "EXTERNAL"
#   timeout_sec           = 30
# }

# resource "google_compute_url_map" "main" {
#   name            = "web-game-lb"
#   default_service = google_compute_backend_service.placeholder.id
# }

# resource "google_compute_target_https_proxy" "https" {
#   name             = "web-game-https-proxy"
#   url_map          = google_compute_url_map.main.id
#   ssl_certificates = [google_compute_managed_ssl_certificate.cert.id]
# }

# resource "google_compute_global_forwarding_rule" "https" {
#   name                  = "web-game-https-forwarding-rule"
#   ip_address            = google_compute_global_address.ip.address
#   ip_protocol           = "TCP"
#   port_range            = "443"
#   target                = google_compute_target_https_proxy.https.id
#   load_balancing_scheme = "EXTERNAL"
# }
