resource "google_compute_global_address" "global_ip" {
  name          = "web-game-global-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"  # 인터넷용(EXTERNAL) 아님. VPC 내부 전용 대역
  prefix_length = 16          # 피어링 대역 크기. /16 = IP 6.5만개. Google 권장값(나중에 못 늘려서 크게 잡음)
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
    availability_type = "ZONAL"         #돈 아낄 용도의 zonal.....
    ip_configuration {
      ipv4_enabled    = false  
      private_network = google_compute_network.web_game_network.id # 이게 VPC 피어링을 한 다음, 외부에 있음에도 vpc 내부망 ip를 주게끔 해놓은 것
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
