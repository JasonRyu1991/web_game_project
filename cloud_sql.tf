resource "google_compute_global_address" "global_ip" {
  name          = "web-game-global-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"  # 인터넷용(EXTERNAL) 아님. VPC 내부 전용 대역
  prefix_length = 16          # /16 = IP 6.5만개. 나중에 못 늘려서 Google 권장대로 크게
  network       = google_compute_network.web_game_network.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.web_game_network.id
  service                 = "servicenetworking.googleapis.com"  # Google 관리 서비스(SQL·Redis 등) 공통 프라이빗 연결망
  reserved_peering_ranges = [google_compute_global_address.global_ip.name]
}

resource "google_sql_database_instance" "web_game_db_instance" {
  name             = "web-game-db-instance"
  database_version = "POSTGRES_15"
  region           = var.region

  depends_on = [google_service_networking_connection.private_vpc_connection]  # 피어링 완료 전에 인스턴스 만들면 실패. 순서 강제

  settings {
    tier              = "db-f1-micro"  
    availability_type = "ZONAL"         # 싸게 가려고 단일 존
    ip_configuration {
      ipv4_enabled    = false  
      private_network = google_compute_network.web_game_network.id # 피어링 덕에 외부 인스턴스가 VPC 내부 IP를 받음
    }
  }

  deletion_protection = false  # 안 끄면 terraform destroy 가 막힘(destroy 반복 트랙이라 필수)
}

resource "google_sql_database" "web_game_db" {
  name     = "web_game_db"
  instance = google_sql_database_instance.web_game_db_instance.name
}

resource "google_sql_user" "web_game_db_user" {
  name     = "web_game_user"
  instance = google_sql_database_instance.web_game_db_instance.name
  password = var.db_password
}
