'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';
import Image from 'next/image';

// Type for a single generation
type Generation = {
  id: string;
  prompt: string;
  imageData: string;
  finalPrompt: string;
  userDescription: string;
  timings: {
    promptGeneration: number;
    imageGeneration: number;
    total: number;
  };
  timestamp: Date;
};

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [finalPrompt, setFinalPrompt] = useState<string | null>(null);
  const [userDescription, setUserDescription] = useState<string | null>(null);
  const [timings, setTimings] = useState<{
    promptGeneration: number;
    imageGeneration: number;
    total: number;
  } | null>(null);
  const [activeTab, setActiveTab] = useState('image');
  const [history, setHistory] = useState<Generation[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  // Close history dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setHistoryOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [historyRef]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!prompt.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate image');
      }
      
      setImageData(data.imageData);
      setFinalPrompt(data.finalPrompt);
      setUserDescription(data.userDescription);
      setTimings(data.timings);
      setActiveTab('image');
      
      // Create a new generation and add to history
      const newGeneration: Generation = {
        id: Date.now().toString(),
        prompt,
        imageData: data.imageData,
        finalPrompt: data.finalPrompt,
        userDescription: data.userDescription,
        timings: data.timings,
        timestamp: new Date()
      };
      
      setHistory(prev => [newGeneration, ...prev]);
      setSelectedGeneration(newGeneration.id);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  const loadFromHistory = (id: string) => {
    const selected = history.find(item => item.id === id);
    if (selected) {
      setImageData(selected.imageData);
      setFinalPrompt(selected.finalPrompt);
      setUserDescription(selected.userDescription);
      setTimings(selected.timings);
      setSelectedGeneration(id);
      setActiveTab('image');
      setHistoryOpen(false); // Close dropdown after selection
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center mb-2">D&D Battlemap Generator</h1>
        <p className="text-gray-400 text-center mb-8">
          Generate hand-drawn style top-down 2D dungeon battlemaps using OpenAI's GPT-Image-1
        </p>
        
        {/* Input and History Section */}
        <div className="flex mb-8 gap-4 items-start">
          <div className="flex-1">
            <label htmlFor="prompt" className="block text-lg font-medium mb-2">
              Describe your battlemap scene/setting:
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Examples: 'Ancient forgotten temple with overgrown vegetation' or 'Dwarven forge inside a volcano'"
              className="w-full p-4 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 min-h-[120px]"
              required
            />
          </div>
          
          {/* History Dropdown */}
          {history.length > 0 && (
            <div className="relative" ref={historyRef}>
              <button 
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium px-4 py-3 rounded-lg flex items-center gap-2"
                onClick={() => setHistoryOpen(!historyOpen)}
              >
                <span>History</span>
                <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {history.length}
                </span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>
              
              {historyOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20">
                  <div className="p-2 max-h-96 overflow-y-auto custom-scrollbar">
                    <h3 className="uppercase text-xs font-bold text-gray-400 mb-2 px-2">Generation History</h3>
                    <div className="space-y-2">
                      {history.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => loadFromHistory(item.id)}
                          className={`w-full text-left rounded-lg overflow-hidden transition flex items-start p-2 hover:bg-gray-700 ${
                            selectedGeneration === item.id 
                              ? 'bg-gray-700 ring-1 ring-blue-500' 
                              : ''
                          }`}
                        >
                          <div className="w-16 h-16 flex-shrink-0 mr-2 rounded overflow-hidden">
                            <img src={item.imageData} alt="Thumbnail" className="w-full h-full object-cover" />
                          </div>
                          <div className="overflow-hidden flex-1">
                            <p className="text-sm font-medium truncate text-white">{item.prompt}</p>
                            <p className="text-xs text-gray-400">
                              {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Generate Button */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full mb-8 bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Generating Battlemap...' : 'Generate Battlemap'}
        </button>
        
        {error && (
          <div className="bg-red-900/60 border border-red-700 text-red-200 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}
        
        {/* Generated content */}
        {imageData && (
          <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg">
            {/* Tabs and Timing */}
            <div className="flex border-b border-gray-700">
              <button 
                onClick={() => setActiveTab('image')}
                className={`px-6 py-3 font-medium ${activeTab === 'image' 
                  ? 'border-b-2 border-blue-500 text-blue-400' 
                  : 'text-gray-400 hover:text-gray-200'}`}
              >
                Battlemap
              </button>
              <button 
                onClick={() => setActiveTab('prompt')}
                className={`px-6 py-3 font-medium ${activeTab === 'prompt' 
                  ? 'border-b-2 border-blue-500 text-blue-400' 
                  : 'text-gray-400 hover:text-gray-200'}`}
              >
                Prompt Details
              </button>
              
              {/* Timing info pill */}
              {timings && (
                <div className="ml-auto flex items-center mr-4 bg-gray-900 rounded-full px-3 py-1 text-xs">
                  <div className="text-blue-400 mr-2">
                    Prompt: {(timings.promptGeneration / 1000).toFixed(1)}s
                  </div>
                  <div className="text-green-400 mx-2">
                    Image: {(timings.imageGeneration / 1000).toFixed(1)}s
                  </div>
                  <div className="text-purple-400 ml-2">
                    Total: {(timings.total / 1000).toFixed(1)}s
                  </div>
                </div>
              )}
            </div>
            
            {/* Tab content */}
            <div className="p-4">
              {activeTab === 'image' && (
                <div className="flex justify-center">
                  <img 
                    src={imageData} 
                    alt="Generated Battlemap"
                    className="max-w-full max-h-[80vh]"
                  />
                </div>
              )}
              
              {activeTab === 'prompt' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium mb-2 text-gray-300">Your Description:</h3>
                    <div className="bg-gray-900 p-4 rounded-lg text-gray-300">
                      {userDescription}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium mb-2 text-gray-300">Generated Prompt:</h3>
                    <div className="bg-gray-900 p-4 rounded-lg text-gray-300 max-h-[400px] overflow-auto whitespace-pre-wrap">
                      {finalPrompt}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(31, 41, 55, 0.5);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(75, 85, 99, 0.7);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(107, 114, 128, 0.8);
        }
      `}</style>
    </div>
  );
}
