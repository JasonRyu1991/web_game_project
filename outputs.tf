output "nameservers" {
  description = "가비아 네임서버 설정에 이 값 4개가 그대로 들어가야 한다"
  value       = google_dns_managed_zone.root.name_servers
}
