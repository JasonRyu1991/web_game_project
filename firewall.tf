resource "google_compute_firewall" "allow_ssh_from_iap" {
  name    = "web-game-allow-ssh-iap"
  network = google_compute_network.web_game_network.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # 구글이 IAP 터널링용으로 공식 배정한 고정 대역. 이 대역만 허용해야
  # Bastion VM 없이 IAP 를 거친 SSH 접속만 통과시킬 수 있다.
  source_ranges = ["35.235.240.0/20"]
}

resource "google_compute_firewall" "allow_lb_healthcheck" {
  name    = "web-game-allow-lb-healthcheck"
  network = google_compute_network.web_game_network.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  # 구글 HTTP(S) LB 헬스체커의 고정 IP 대역 두 개. 유저 트래픽은 LB 가
  # 받아서 GKE 파드로 넘기므로, 여기서는 헬스체크만 통과시키면 된다.
  source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
}

resource "google_compute_firewall" "allow_internal_icmp" {
  name    = "web-game-allow-internal-icmp"
  network = google_compute_network.web_game_network.name

  allow {
    protocol = "icmp"
  }

  # 서브넷 리소스 값을 그대로 참조한다. 대역을 나중에 바꿔도 여기가
  # 자동으로 같이 바뀌어서 두 군데를 따로 고칠 일이 없다.
  source_ranges = [google_compute_subnetwork.web_game_subnet.ip_cidr_range]
}
