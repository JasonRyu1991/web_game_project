resource "google_project_service" "apis" { #구글은 귀찮다. 일일이 프로젝트마다 api를 켜야한다.. 망할놈들
  for_each = toset([
    "compute.googleapis.com",              # VPC·서브넷·방화벽·Router/NAT·고정IP·SSL인증서·LB
    "container.googleapis.com",             # GKE 클러스터·노드풀
    "artifactregistry.googleapis.com",      # 컨테이너 이미지 저장소
    "servicenetworking.googleapis.com",     # VPC 피어링(Cloud SQL 프라이빗 연결)
    "sqladmin.googleapis.com",              # Cloud SQL 인스턴스 관리
    "dns.googleapis.com",                   # Cloud DNS 존·레코드
    "iam.googleapis.com",                   # 서비스 계정·IAM 역할
    "iamcredentials.googleapis.com",        # 서비스 계정 impersonation(WIF)
    "sts.googleapis.com",                   # 토큰 교환(GitHub OIDC → GCP, WIF)
    "cloudresourcemanager.googleapis.com",  # 프로젝트 단위 IAM 바인딩
    "monitoring.googleapis.com",            # Managed Prometheus·Cloud Monitoring
    "logging.googleapis.com",               # 노드·워크로드 로그 수집
  ])

  service            = each.value
  disable_on_destroy = false
}
