terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "8.0.0"
    }
  }
}

provider "google" {
  project     = "personal-webgame-project"
  region      = "asia-northeast3"
  zone        = "asia-northeast3-a"
}
