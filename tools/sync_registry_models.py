#!/usr/bin/env python3
"""
Sync Registry Models
Downloads/updates existing models from global_registry.json (Hugging Face and GitHub)
"""

import json
import os
import sys
import argparse
import requests
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse, quote
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm
import hashlib
import time
from datetime import datetime

class ModelDownloader:
    def __init__(self, registry_path: str = "models/global_registry.json", 
                 models_dir: str = "models", 
                 max_workers: int = 3):
        """
        Initialize the model downloader
        
        Args:
            registry_path: Path to global_registry.json
            models_dir: Base directory for downloaded models
            max_workers: Maximum number of concurrent downloads
        """
        self.registry_path = Path(registry_path)
        self.models_dir = Path(models_dir)
        self.max_workers = max_workers
        self.registry = self._load_registry()
        
        # Hugging Face token (optional, for private repos or higher rate limits)
        self.hf_token = os.environ.get('HF_TOKEN', None)
        
    def _load_registry(self) -> Dict:
        """Load the global registry JSON file"""
        if not self.registry_path.exists():
            raise FileNotFoundError(f"Registry file not found: {self.registry_path}")
        
        with open(self.registry_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def _save_registry(self):
        """Save the updated registry back to file"""
        with open(self.registry_path, 'w', encoding='utf-8') as f:
            json.dump(self.registry, f, indent=2, ensure_ascii=False)
    
    def list_models(self, filter_type: Optional[str] = None, 
                   filter_status: Optional[str] = None) -> List[Dict]:
        """
        List all models with optional filtering
        
        Args:
            filter_type: Filter by model type (asr, wakeword, vad, etc.)
            filter_status: Filter by status (downloaded, pending)
        """
        models = self.registry.get('models', [])
        
        if filter_type:
            models = [m for m in models if m.get('type') == filter_type]
        
        if filter_status == 'downloaded':
            models = [m for m in models if m.get('status', {}).get('downloaded', False)]
        elif filter_status == 'pending':
            models = [m for m in models if not m.get('status', {}).get('downloaded', False)]
        
        return models
    
    def _get_download_url(self, model: Dict, file_path: str) -> str:
        """
        Construct the download URL based on the platform
        
        Args:
            model: Model dictionary from registry
            file_path: Relative path to the file
        """
        platform = model['source']['platform']
        
        if platform == 'huggingface':
            # Hugging Face URL format
            repo = f"{model['source']['author']}/{model['source']['repository']}"
            # Use resolve/main for direct download
            url = f"https://huggingface.co/{repo}/resolve/main/{file_path}"
            
        elif platform == 'github':
            # GitHub raw content URL
            author = model['source']['author']
            repo = model['source']['repository']
            branch = model['source'].get('branch', 'main')
            
            # For openWakeWord models, construct the proper URL
            if repo == 'openWakeWord':
                # These are typically in releases
                release = model['source'].get('release', 'latest')
                if release != 'latest':
                    url = f"https://github.com/{author}/{repo}/releases/download/{release}/{file_path}"
                else:
                    url = f"https://github.com/{author}/{repo}/raw/{branch}/models/{file_path}"
            else:
                url = f"https://raw.githubusercontent.com/{author}/{repo}/{branch}/{file_path}"
        
        else:
            raise ValueError(f"Unsupported platform: {platform}")
        
        return url
    
    def _download_file(self, url: str, dest_path: Path, 
                      chunk_size: int = 8192) -> Tuple[bool, str]:
        """
        Download a single file with progress bar
        
        Args:
            url: URL to download from
            dest_path: Destination file path
            chunk_size: Download chunk size
            
        Returns:
            Tuple of (success, message)
        """
        headers = {}
        if self.hf_token and 'huggingface.co' in url:
            headers['Authorization'] = f'Bearer {self.hf_token}'
        
        try:
            # Create parent directory if it doesn't exist
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Check if file already exists
            if dest_path.exists():
                return True, f"Already exists: {dest_path.name}"
            
            # Start download
            response = requests.get(url, headers=headers, stream=True, timeout=30)
            response.raise_for_status()
            
            # Get file size
            total_size = int(response.headers.get('content-length', 0))
            
            # Download with progress bar
            with open(dest_path, 'wb') as f:
                with tqdm(total=total_size, unit='B', unit_scale=True, 
                         desc=dest_path.name, leave=False) as pbar:
                    for chunk in response.iter_content(chunk_size=chunk_size):
                        if chunk:
                            f.write(chunk)
                            pbar.update(len(chunk))
            
            return True, f"Downloaded: {dest_path.name}"
            
        except requests.exceptions.RequestException as e:
            # Clean up partial file
            if dest_path.exists():
                dest_path.unlink()
            return False, f"Failed to download {dest_path.name}: {str(e)}"
        except Exception as e:
            if dest_path.exists():
                dest_path.unlink()
            return False, f"Error downloading {dest_path.name}: {str(e)}"
    
    def download_model(self, model_id: str, force: bool = False, 
                      include_optional: bool = False) -> bool:
        """
        Download a specific model and its files
        
        Args:
            model_id: Model ID from registry
            force: Force re-download even if files exist
            include_optional: Also download optional files
            
        Returns:
            True if successful, False otherwise
        """
        # Find model in registry
        model = next((m for m in self.registry['models'] if m['id'] == model_id), None)
        if not model:
            print(f"❌ Model not found: {model_id}")
            return False
        
        print(f"\n📦 Downloading model: {model['name']}")
        print(f"   Platform: {model['source']['platform']}")
        print(f"   Type: {model['type']}")
        
        # Check if already downloaded
        if not force and model.get('status', {}).get('downloaded', False):
            print(f"✅ Model already downloaded. Use --force to re-download.")
            return True
        
        # Prepare local directory
        local_path = self.models_dir / model['local_path']
        local_path.mkdir(parents=True, exist_ok=True)
        
        # Collect files to download
        files_to_download = []
        
        # Add required files
        required_files = model.get('files', {}).get('required', [])
        for file in required_files:
            files_to_download.append((file, True))  # True = required
        
        # Add optional files if requested
        if include_optional:
            optional_files = model.get('files', {}).get('optional', [])
            for file in optional_files:
                files_to_download.append((file, False))  # False = optional
        
        if not files_to_download:
            print(f"⚠️  No files specified for model {model_id}")
            return False
        
        print(f"📂 Downloading {len(files_to_download)} files...")
        
        # Download files
        success_count = 0
        failed_files = []
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {}
            
            for file_path, is_required in files_to_download:
                url = self._get_download_url(model, file_path)
                dest = local_path / file_path
                
                future = executor.submit(self._download_file, url, dest)
                futures[future] = (file_path, is_required)
            
            # Process completed downloads
            for future in as_completed(futures):
                file_path, is_required = futures[future]
                success, message = future.result()
                
                if success:
                    print(f"   ✅ {message}")
                    success_count += 1
                else:
                    print(f"   ❌ {message}")
                    if is_required:
                        failed_files.append(file_path)
        
        # Update registry status
        if 'status' not in model:
            model['status'] = {}
        
        if not failed_files:
            model['status']['downloaded'] = True
            model['status']['verified'] = True
            model['status']['download_date'] = datetime.now().strftime('%Y-%m-%d')
            self._save_registry()
            print(f"\n✅ Successfully downloaded {success_count}/{len(files_to_download)} files")
            return True
        else:
            print(f"\n❌ Failed to download required files: {', '.join(failed_files)}")
            return False
    
    def download_all(self, model_type: Optional[str] = None, 
                     force: bool = False, include_optional: bool = False):
        """
        Download all models or models of a specific type
        
        Args:
            model_type: Optional model type filter
            force: Force re-download
            include_optional: Include optional files
        """
        models = self.list_models(filter_type=model_type)
        
        if not models:
            print(f"No models found{f' of type {model_type}' if model_type else ''}")
            return
        
        print(f"🚀 Downloading {len(models)} models...")
        
        success_count = 0
        for model in models:
            if self.download_model(model['id'], force=force, 
                                  include_optional=include_optional):
                success_count += 1
            time.sleep(1)  # Be nice to servers
        
        print(f"\n📊 Downloaded {success_count}/{len(models)} models successfully")
    
    def verify_model(self, model_id: str) -> bool:
        """
        Verify that all required files for a model exist
        
        Args:
            model_id: Model ID to verify
            
        Returns:
            True if all required files exist
        """
        model = next((m for m in self.registry['models'] if m['id'] == model_id), None)
        if not model:
            print(f"❌ Model not found: {model_id}")
            return False
        
        local_path = self.models_dir / model['local_path']
        required_files = model.get('files', {}).get('required', [])
        
        missing_files = []
        for file in required_files:
            file_path = local_path / file
            if not file_path.exists():
                missing_files.append(file)
        
        if missing_files:
            print(f"❌ Missing files for {model_id}:")
            for file in missing_files:
                print(f"   - {file}")
            return False
        else:
            print(f"✅ All required files present for {model_id}")
            return True
    
    def show_stats(self):
        """Show download statistics"""
        models = self.registry.get('models', [])
        stats = self.registry.get('statistics', {})
        
        downloaded = len([m for m in models if m.get('status', {}).get('downloaded', False)])
        pending = len(models) - downloaded
        
        print("\n📊 Model Registry Statistics")
        print("=" * 40)
        print(f"Total models: {len(models)}")
        print(f"Downloaded: {downloaded}")
        print(f"Pending: {pending}")
        print(f"Total size: {stats.get('total_size_mb', 0):,} MB")
        
        print("\nBy type:")
        for type_name, count in stats.get('by_type', {}).items():
            print(f"  {type_name}: {count}")
        
        print("\nBy source:")
        for source, count in stats.get('by_source', {}).items():
            print(f"  {source}: {count}")


def main():
    parser = argparse.ArgumentParser(description='Sync models from global registry (download/verify existing models)')
    parser.add_argument('command', choices=['list', 'download', 'download-all', 
                                           'verify', 'stats'],
                       help='Command to execute')
    parser.add_argument('--model-id', '-m', help='Model ID for download/verify')
    parser.add_argument('--type', '-t', help='Filter by model type')
    parser.add_argument('--status', '-s', choices=['downloaded', 'pending'],
                       help='Filter by download status')
    parser.add_argument('--force', '-f', action='store_true',
                       help='Force re-download even if files exist')
    parser.add_argument('--optional', '-o', action='store_true',
                       help='Include optional files in download')
    parser.add_argument('--registry', '-r', default='models/global_registry.json',
                       help='Path to registry file')
    parser.add_argument('--models-dir', '-d', default='models',
                       help='Base directory for models')
    parser.add_argument('--workers', '-w', type=int, default=3,
                       help='Number of concurrent downloads')
    
    args = parser.parse_args()
    
    # Initialize downloader
    downloader = ModelDownloader(
        registry_path=args.registry,
        models_dir=args.models_dir,
        max_workers=args.workers
    )
    
    # Execute command
    if args.command == 'list':
        models = downloader.list_models(
            filter_type=args.type,
            filter_status=args.status
        )
        
        print(f"\n📋 Found {len(models)} models")
        print("=" * 60)
        
        for model in models:
            status = "✅" if model.get('status', {}).get('downloaded', False) else "⏳"
            print(f"{status} {model['id']:20} | {model['type']:10} | {model['name']}")
    
    elif args.command == 'download':
        if not args.model_id:
            print("❌ Please specify a model ID with --model-id")
            sys.exit(1)
        
        success = downloader.download_model(
            args.model_id, 
            force=args.force,
            include_optional=args.optional
        )
        sys.exit(0 if success else 1)
    
    elif args.command == 'download-all':
        downloader.download_all(
            model_type=args.type,
            force=args.force,
            include_optional=args.optional
        )
    
    elif args.command == 'verify':
        if not args.model_id:
            print("❌ Please specify a model ID with --model-id")
            sys.exit(1)
        
        success = downloader.verify_model(args.model_id)
        sys.exit(0 if success else 1)
    
    elif args.command == 'stats':
        downloader.show_stats()


if __name__ == '__main__':
    main()