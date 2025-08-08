#!/usr/bin/env python3
"""
Add New Model from Hugging Face
Downloads new ONNX models from Hugging Face and adds them to global_registry.json
"""

import os
import sys
import json
import argparse
import requests
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from urllib.parse import urlparse
import time
from tqdm import tqdm

class HFModelDownloader:
    """Downloads Hugging Face models and updates global registry"""
    
    # Standard files based on global_registry.json patterns
    REQUIRED_FILES = [
        'onnx/encoder_model.onnx',
        'onnx/decoder_model_merged.onnx',
        'config.json',
        'tokenizer.json',
        'vocab.json',
        'merges.txt',
        'preprocessor_config.json',
        'generation_config.json'
    ]
    
    OPTIONAL_FILES = [
        'onnx/encoder_model_quantized.onnx',
        'onnx/decoder_model_merged_quantized.onnx',
        'model_info.json',
        'normalizer.json',
        'added_tokens.json',
        'special_tokens_map.json',
        'tokenizer_config.json'
    ]
    
    def __init__(self, base_dir: str = 'models', registry_path: str = 'models/global_registry.json'):
        self.base_dir = Path(base_dir)
        self.registry_path = Path(registry_path)
        self.base_dir.mkdir(exist_ok=True)
        self.registry = self._load_registry()
        
        # HF token for private repos or rate limits
        self.hf_token = os.environ.get('HF_TOKEN', None)
        
    def _load_registry(self) -> Dict:
        """Load the global registry"""
        if self.registry_path.exists():
            with open(self.registry_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        else:
            # Create default registry structure
            return {
                "version": "1.0.0",
                "last_updated": datetime.now().strftime('%Y-%m-%d'),
                "description": "Global model registry for voice assistant models",
                "model_types": {
                    "asr": {"name": "Automatic Speech Recognition", "description": "Speech-to-text models"},
                    "wakeword": {"name": "Wake Word Detection", "description": "Keyword spotting models"},
                    "vad": {"name": "Voice Activity Detection", "description": "Speech presence detection models"},
                    "tts": {"name": "Text-to-Speech", "description": "Speech synthesis models"},
                    "nlp": {"name": "Natural Language Processing", "description": "Language understanding models"}
                },
                "sources": {
                    "huggingface": {"base_url": "https://huggingface.co", "api_url": "https://huggingface.co/api"},
                    "github": {"base_url": "https://github.com", "raw_url": "https://raw.githubusercontent.com"},
                    "local": {"base_path": "./models"}
                },
                "models": [],
                "statistics": {
                    "total_models": 0,
                    "by_type": {"asr": 0, "wakeword": 0, "vad": 0, "tts": 0, "nlp": 0},
                    "by_source": {"huggingface": 0, "github": 0, "local": 0},
                    "total_size_mb": 0,
                    "downloaded_models": 0,
                    "pending_models": 0
                }
            }
    
    def _save_registry(self):
        """Save the updated registry"""
        self.registry['last_updated'] = datetime.now().strftime('%Y-%m-%d')
        with open(self.registry_path, 'w', encoding='utf-8') as f:
            json.dump(self.registry, f, indent=2, ensure_ascii=False)
    
    def parse_model_id(self, url_or_id: str) -> Tuple[str, str]:
        """Parse HF URL or model ID to extract owner and model name"""
        if url_or_id.startswith('http'):
            # Parse URL like https://huggingface.co/Xenova/whisper-tiny
            parsed = urlparse(url_or_id)
            parts = parsed.path.strip('/').split('/')
            if len(parts) >= 2:
                return parts[0], parts[1]
            else:
                raise ValueError(f"Invalid Hugging Face URL: {url_or_id}")
        else:
            # Assume format: owner/model-name
            parts = url_or_id.split('/')
            if len(parts) == 2:
                return parts[0], parts[1]
            else:
                raise ValueError(f"Invalid model ID format. Expected 'owner/model' got: {url_or_id}")
    
    def _detect_model_type(self, model_name: str, config: Dict = None) -> str:
        """Detect model type based on name and config"""
        model_name_lower = model_name.lower()
        
        # Check by model name patterns
        if 'whisper' in model_name_lower:
            return 'asr'
        elif any(wake in model_name_lower for wake in ['wake', 'hey', 'alexa', 'jarvis', 'mycroft', 'kmu']):
            return 'wakeword'
        elif 'vad' in model_name_lower or 'voice' in model_name_lower and 'activity' in model_name_lower:
            return 'vad'
        elif 'tts' in model_name_lower or 'speech' in model_name_lower and 'synthesis' in model_name_lower:
            return 'tts'
        elif 'bert' in model_name_lower or 'gpt' in model_name_lower or 'nlp' in model_name_lower:
            return 'nlp'
        
        # Check config if available
        if config:
            task = config.get('task', '').lower()
            if 'speech-recognition' in task or 'asr' in task:
                return 'asr'
            elif 'text-to-speech' in task or 'tts' in task:
                return 'tts'
        
        # Default to ASR for unknown models
        return 'asr'
    
    def _estimate_model_size(self, model_name: str) -> int:
        """Estimate model size in MB based on name"""
        name_lower = model_name.lower()
        
        if 'tiny' in name_lower:
            return 39
        elif 'base' in name_lower:
            return 74
        elif 'small' in name_lower:
            return 244
        elif 'medium' in name_lower:
            return 769
        elif 'large-v3' in name_lower:
            return 1550
        elif 'large-v2' in name_lower:
            return 1550
        elif 'large' in name_lower:
            return 1550
        else:
            return 100  # Default estimate
    
    def download_file(self, url: str, dest_path: Path, show_progress: bool = True) -> bool:
        """Download a single file from URL to destination with progress bar"""
        headers = {}
        if self.hf_token and 'huggingface.co' in url:
            headers['Authorization'] = f'Bearer {self.hf_token}'
        
        try:
            response = requests.get(url, headers=headers, stream=True, timeout=30)
            response.raise_for_status()
            
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            total_size = int(response.headers.get('content-length', 0))
            
            if show_progress and total_size > 0:
                with open(dest_path, 'wb') as f:
                    with tqdm(total=total_size, unit='B', unit_scale=True, 
                             desc=dest_path.name, leave=False) as pbar:
                        for chunk in response.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                                pbar.update(len(chunk))
            else:
                with open(dest_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                if not show_progress:
                    print(f"  ✓ {dest_path.name}")
            
            return True
            
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                if not show_progress:
                    print(f"  ⏭️  {dest_path.name} (not found)")
            else:
                print(f"  ❌ {dest_path.name} (HTTP {e.response.status_code})")
            return False
        except Exception as e:
            print(f"  ❌ {dest_path.name} ({str(e)})")
            return False
    
    def build_file_url(self, owner: str, model: str, file_path: str, branch: str = 'main') -> str:
        """Build the raw file URL for Hugging Face"""
        return f"https://huggingface.co/{owner}/{model}/resolve/{branch}/{file_path}"
    
    def find_existing_model(self, owner: str, model_name: str) -> Optional[Dict]:
        """Find if model already exists in registry"""
        for model in self.registry.get('models', []):
            if (model.get('source', {}).get('author') == owner and 
                model.get('source', {}).get('repository') == model_name):
                return model
        return None
    
    def download_model(self, model_id: str, force: bool = False, 
                      include_optional: bool = True) -> Dict:
        """Download a complete model and update registry"""
        owner, model_name = self.parse_model_id(model_id)
        model_id_clean = f"{owner}/{model_name}"
        
        print(f"\n🤖 Processing model: {model_id_clean}")
        
        # Check if model exists in registry
        existing_model = self.find_existing_model(owner, model_name)
        
        if existing_model and not force:
            if existing_model.get('status', {}).get('downloaded', False):
                print(f"✅ Model already in registry and downloaded. Use --force to re-download.")
                return existing_model
        
        # Determine output directory
        model_dir = self.base_dir / 'huggingface' / owner / model_name
        model_dir.mkdir(parents=True, exist_ok=True)
        
        print(f"📁 Output directory: {model_dir}")
        
        # Download config.json first to get model info
        config_url = self.build_file_url(owner, model_name, 'config.json')
        config_path = model_dir / 'config.json'
        config_data = {}
        
        if self.download_file(config_url, config_path, show_progress=False):
            try:
                with open(config_path, 'r') as f:
                    config_data = json.load(f)
            except:
                pass
        
        # Detect model type
        model_type = self._detect_model_type(model_name, config_data)
        
        # Track download results
        files_downloaded = []
        files_failed = []
        
        # Download required files
        print("📥 Downloading required files...")
        for file_path in self.REQUIRED_FILES:
            if file_path == 'config.json' and config_path.exists():
                files_downloaded.append(file_path)
                continue
                
            url = self.build_file_url(owner, model_name, file_path)
            dest_path = model_dir / file_path
            
            if self.download_file(url, dest_path, show_progress=False):
                files_downloaded.append(file_path)
            else:
                if file_path in ['normalizer.json']:  # Some files are optional even in required list
                    continue
                files_failed.append(file_path)
        
        # Download optional files if requested
        if include_optional:
            print("📥 Downloading optional files...")
            for file_path in self.OPTIONAL_FILES:
                url = self.build_file_url(owner, model_name, file_path)
                dest_path = model_dir / file_path
                
                if self.download_file(url, dest_path, show_progress=False):
                    files_downloaded.append(file_path)
        
        # Create or update model entry
        model_id_short = model_name.replace('.', '-')  # e.g., whisper-tiny.en -> whisper-tiny-en
        
        if existing_model:
            model_entry = existing_model
            print(f"📝 Updating existing model in registry...")
        else:
            model_entry = {
                "id": model_id_short,
                "name": self._format_model_name(model_name),
                "type": model_type,
                "source": {
                    "platform": "huggingface",
                    "author": owner,
                    "repository": model_name,
                    "url": f"https://huggingface.co/{owner}/{model_name}"
                },
                "local_path": f"huggingface/{owner}/{model_name}",
                "description": self._generate_description(model_name, config_data),
                "features": self._extract_features(model_name, config_data),
                "specs": self._extract_specs(model_name, config_data),
                "performance": self._extract_performance(model_name),
                "files": {
                    "required": [f for f in self.REQUIRED_FILES if f in files_downloaded],
                    "optional": [f for f in self.OPTIONAL_FILES if f in files_downloaded]
                },
                "status": {
                    "downloaded": len(files_failed) == 0,
                    "verified": len(files_failed) == 0,
                    "download_date": datetime.now().strftime('%Y-%m-%d')
                },
                "tags": self._generate_tags(model_name)
            }
            
            # Add to registry
            self.registry['models'].append(model_entry)
            print(f"✨ Added new model to registry: {model_id_short}")
        
        # Update model status
        model_entry['status']['downloaded'] = len(files_failed) == 0
        model_entry['status']['download_date'] = datetime.now().strftime('%Y-%m-%d')
        
        # Update statistics
        self._update_statistics()
        
        # Save registry
        self._save_registry()
        
        print(f"\n✅ Download complete!")
        print(f"   Files downloaded: {len(files_downloaded)}")
        if files_failed:
            print(f"   Files failed: {len(files_failed)}")
            for f in files_failed:
                print(f"     - {f}")
        
        return model_entry
    
    def _format_model_name(self, model_name: str) -> str:
        """Format model name for display"""
        name = model_name.replace('-', ' ').replace('_', ' ')
        name = ' '.join(word.capitalize() for word in name.split())
        
        # Special cases
        name = name.replace('Whisper', 'Whisper')
        name = name.replace('.En', ' English')
        name = name.replace('Vad', 'VAD')
        name = name.replace('Tts', 'TTS')
        name = name.replace('V2', 'V2')
        name = name.replace('V3', 'V3')
        
        return name
    
    def _generate_description(self, model_name: str, config: Dict) -> str:
        """Generate model description"""
        name_lower = model_name.lower()
        
        if 'whisper' in name_lower:
            if 'tiny' in name_lower:
                desc = "Smallest Whisper model, fastest inference"
            elif 'base' in name_lower:
                desc = "Base model with good balance of speed and accuracy"
            elif 'small' in name_lower:
                desc = "Small model with enhanced accuracy"
            elif 'medium' in name_lower:
                desc = "Medium model for professional applications"
            elif 'large-v3' in name_lower:
                desc = "Latest large model with state-of-the-art performance"
            elif 'large-v2' in name_lower:
                desc = "Second generation large model with improvements"
            elif 'large' in name_lower:
                desc = "Large model with excellent performance"
            else:
                desc = "Whisper automatic speech recognition model"
            
            if '.en' in name_lower:
                desc = f"English-only {desc.lower()}"
            
            return desc
        
        return config.get('description', f"AI model for {model_name}")
    
    def _extract_features(self, model_name: str, config: Dict) -> Dict:
        """Extract model features"""
        features = {}
        name_lower = model_name.lower()
        
        if 'whisper' in name_lower:
            features['multilingual'] = '.en' not in name_lower
            features['languages'] = ['en'] if '.en' in name_lower else ['multi']
            features['input_format'] = 'audio/wav'
            features['output_format'] = 'text'
            features['sample_rate'] = 16000
        
        return features
    
    def _extract_specs(self, model_name: str, config: Dict) -> Dict:
        """Extract model specifications"""
        specs = {
            'format': 'onnx',
            'size_mb': self._estimate_model_size(model_name)
        }
        
        name_lower = model_name.lower()
        if 'tiny' in name_lower:
            specs['parameters'] = '39M'
        elif 'base' in name_lower:
            specs['parameters'] = '74M'
        elif 'small' in name_lower:
            specs['parameters'] = '244M'
        elif 'medium' in name_lower:
            specs['parameters'] = '769M'
        elif 'large' in name_lower:
            specs['parameters'] = '1550M'
        
        if 'whisper' in name_lower:
            specs['quantized'] = True
        
        return specs
    
    def _extract_performance(self, model_name: str) -> Dict:
        """Extract performance metrics"""
        perf = {}
        name_lower = model_name.lower()
        
        if 'whisper' in name_lower:
            if 'tiny' in name_lower:
                perf = {'wer': 15.0 if '.en' not in name_lower else 12.0, 'speed_multiplier': 10}
            elif 'base' in name_lower:
                perf = {'wer': 12.0 if '.en' not in name_lower else 10.0, 'speed_multiplier': 7}
            elif 'small' in name_lower:
                perf = {'wer': 9.0 if '.en' not in name_lower else 7.5, 'speed_multiplier': 4}
            elif 'medium' in name_lower:
                perf = {'wer': 7.0 if '.en' not in name_lower else 5.5, 'speed_multiplier': 2}
            elif 'large-v3' in name_lower:
                perf = {'wer': 4.0, 'speed_multiplier': 1}
            elif 'large-v2' in name_lower:
                perf = {'wer': 4.5, 'speed_multiplier': 1}
            elif 'large' in name_lower:
                perf = {'wer': 5.0, 'speed_multiplier': 1}
            
            perf['gpu_required'] = 'large' in name_lower
        
        return perf
    
    def _generate_tags(self, model_name: str) -> List[str]:
        """Generate relevant tags for the model"""
        tags = []
        name_lower = model_name.lower()
        
        if 'whisper' in name_lower:
            tags.append('whisper')
        
        if 'tiny' in name_lower:
            tags.extend(['tiny', 'fast', 'lightweight'])
        elif 'base' in name_lower:
            tags.extend(['base', 'balanced'])
        elif 'small' in name_lower:
            tags.extend(['small', 'accurate'])
        elif 'medium' in name_lower:
            tags.extend(['medium', 'professional'])
        elif 'large' in name_lower:
            tags.append('large')
            if 'v3' in name_lower:
                tags.extend(['sota', 'v3'])
            elif 'v2' in name_lower:
                tags.append('v2')
            tags.append('accurate')
        
        if '.en' in name_lower:
            tags.append('english')
        
        return tags
    
    def _update_statistics(self):
        """Update registry statistics"""
        models = self.registry.get('models', [])
        stats = self.registry.get('statistics', {})
        
        stats['total_models'] = len(models)
        
        # Count by type
        by_type = {'asr': 0, 'wakeword': 0, 'vad': 0, 'tts': 0, 'nlp': 0}
        for model in models:
            model_type = model.get('type', 'asr')
            if model_type in by_type:
                by_type[model_type] += 1
        stats['by_type'] = by_type
        
        # Count by source
        by_source = {'huggingface': 0, 'github': 0, 'local': 0}
        for model in models:
            source = model.get('source', {}).get('platform', 'local')
            if source in by_source:
                by_source[source] += 1
        stats['by_source'] = by_source
        
        # Count downloaded
        downloaded = sum(1 for m in models if m.get('status', {}).get('downloaded', False))
        stats['downloaded_models'] = downloaded
        stats['pending_models'] = len(models) - downloaded
        
        # Calculate total size
        total_size = sum(m.get('specs', {}).get('size_mb', 0) for m in models)
        stats['total_size_mb'] = total_size
        
        self.registry['statistics'] = stats


def main():
    parser = argparse.ArgumentParser(
        description='Add new models from Hugging Face to the global registry',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Add a single model from Hugging Face
  python add_new_model.py Xenova/whisper-tiny
  
  # Add multiple models
  python add_new_model.py Xenova/whisper-tiny Xenova/whisper-base
  
  # Force re-download if model exists
  python add_new_model.py Xenova/whisper-small --force
  
  # Skip optional files
  python add_new_model.py Xenova/whisper-large --no-optional
  
  # Use custom registry path
  python add_new_model.py Xenova/whisper-medium --registry custom_registry.json
        """
    )
    
    parser.add_argument('models', nargs='+', 
                       help='Hugging Face model URLs or IDs (e.g., Xenova/whisper-tiny)')
    parser.add_argument('-d', '--base-dir', default='models',
                       help='Base directory for models (default: models)')
    parser.add_argument('-r', '--registry', default='models/global_registry.json',
                       help='Path to global registry file')
    parser.add_argument('-f', '--force', action='store_true',
                       help='Force re-download even if model exists')
    parser.add_argument('--no-optional', action='store_true',
                       help='Skip downloading optional files')
    parser.add_argument('--token', help='Hugging Face API token')
    
    args = parser.parse_args()
    
    # Set HF token if provided
    if args.token:
        os.environ['HF_TOKEN'] = args.token
    
    # Initialize downloader
    downloader = HFModelDownloader(base_dir=args.base_dir, registry_path=args.registry)
    
    # Download models
    results = []
    for model in args.models:
        try:
            result = downloader.download_model(
                model, 
                force=args.force,
                include_optional=not args.no_optional
            )
            results.append(result)
        except Exception as e:
            print(f"\n❌ Error downloading {model}: {str(e)}")
            continue
    
    # Summary
    print(f"\n{'='*50}")
    print(f"📊 Download Summary:")
    print(f"   Total models processed: {len(results)}")
    successful = sum(1 for r in results if r.get('status', {}).get('downloaded', False))
    print(f"   Successful downloads: {successful}")
    if len(results) > successful:
        print(f"   Failed downloads: {len(results) - successful}")
    
    print(f"\n📋 Registry updated: {downloader.registry_path}")
    print(f"   Total models in registry: {len(downloader.registry.get('models', []))}")


if __name__ == '__main__':
    main()