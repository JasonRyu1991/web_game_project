resource "google_dns_managed_zone" "root" {
  name        = "web-game-zone"
  dns_name    = "1bit.kr."
  description = "1bit.kr 루트 도메인"
}

resource "google_compute_global_address" "ip" {
  name = "web-game-static-ip"
}

resource "google_compute_managed_ssl_certificate" "cert" {
  name = "web-game-cert"

  managed {
    domains = ["1bit.kr."]
  }
}

resource "google_dns_record_set" "a" {
  name         = google_dns_managed_zone.root.dns_name
  managed_zone = google_dns_managed_zone.root.name
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_global_address.ip.address]
}
