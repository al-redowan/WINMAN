
import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeminiService, ApiResponse } from './services/gemini.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private geminiService = inject(GeminiService);

  userInput = signal('');
  uploadedImage = signal<{ file: File | null; previewUrl: string | null }>({ file: null, previewUrl: null });
  isLoading = signal(false);
  isExtractingText = signal(false);
  error = signal<string | null>(null);
  responses = signal<ApiResponse | null>(null);
  
  copiedState = signal<{[key: number]: boolean}>({});

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      
      // Reset state for new upload
      this.userInput.set('');
      this.error.set(null);
      this.responses.set(null);
      this.copiedState.set({});

      // Show preview immediately
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.uploadedImage.set({ file, previewUrl: e.target.result });
      };
      reader.readAsDataURL(file);

      // Start text extraction
      this.isExtractingText.set(true);
      this.geminiService.getTextFromImage(file)
        .then(extractedText => {
          this.userInput.set(extractedText);
        })
        .catch(e => {
          this.error.set(e.message || 'Failed to extract text from image.');
          this.uploadedImage.set({ file: null, previewUrl: null }); // Clear preview on error
          const fileInput = document.getElementById('file-upload') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
        })
        .finally(() => {
          this.isExtractingText.set(false);
        });
    }
  }

  async getHelp(): Promise<void> {
    if (!this.userInput() && !this.uploadedImage().file) {
      this.error.set("Please enter her message or upload a screenshot.");
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.responses.set(null);
    this.copiedState.set({});

    try {
      const result = await this.geminiService.generateReplies(
        this.userInput(),
        this.uploadedImage().file
      );
      this.responses.set(result);
    } catch (e: any) {
      this.error.set(e.message || 'An unknown error occurred.');
    } finally {
      this.isLoading.set(false);
    }
  }

  clearInput(): void {
    this.userInput.set('');
    this.uploadedImage.set({ file: null, previewUrl: null });
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) {
        fileInput.value = '';
    }
    this.responses.set(null);
    this.error.set(null);
    this.copiedState.set({});
  }
  
  copyToClipboard(text: string, index: number): void {
    navigator.clipboard.writeText(text).then(() => {
        this.copiedState.update(state => ({...state, [index]: true}));
        setTimeout(() => {
            this.copiedState.update(state => ({...state, [index]: false}));
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
  }
}
