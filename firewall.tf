resource "google_compute_firewall" "allow_ssh_from_iap" {
  name    = "web-game-allow-ssh-iap"
  network = google_compute_network.web_game_network.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # 구글 IAP 터널 고정 대역. 이것만 열어야 Bastion 없이 IAP 경유 SSH만 통과
  source_ranges = ["35.235.240.0/20"]
}

resource "google_compute_firewall" "allow_lb_healthcheck" {
  name    = "web-game-allow-lb-healthcheck"
  network = google_compute_network.web_game_network.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  # 구글 LB 헬스체커 고정 대역. 유저 트래픽은 LB가 받으니 헬스체크만 통과시키면 됨
  source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
}

resource "google_compute_firewall" "allow_internal_icmp" {
  name    = "web-game-allow-internal-icmp"
  network = google_compute_network.web_game_network.name

  allow {
    protocol = "icmp"
  }

  # 서브넷 대역 참조 — 바뀌면 여기도 자동으로 따라감
  source_ranges = [google_compute_subnetwork.web_game_subnet.ip_cidr_range]
}
