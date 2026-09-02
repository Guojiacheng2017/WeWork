import os
from pathlib import Path
from typing import BinaryIO


class LocalArtifactStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, key: str, stream: BinaryIO) -> None:
        target = (self.root / key).resolve()
        if self.root != target and self.root not in target.parents:
            raise ValueError("invalid storage key")
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("wb") as output:
            while chunk := stream.read(1024 * 1024):
                output.write(chunk)


class S3ArtifactStorage:
    def __init__(self):
        import boto3
        self.bucket = os.environ["S3_BUCKET"]
        self.client = boto3.client(
            "s3",
            endpoint_url=os.getenv("S3_ENDPOINT_URL"),
            aws_access_key_id=os.getenv("S3_ACCESS_KEY"),
            aws_secret_access_key=os.getenv("S3_SECRET_KEY"),
            region_name=os.getenv("S3_REGION", "us-east-1"),
        )

    def put(self, key: str, stream: BinaryIO) -> None:
        self.client.upload_fileobj(stream, self.bucket, key)
