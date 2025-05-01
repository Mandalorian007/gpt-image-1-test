'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';

// Type for a light source
type LightSource = {
  x: number;
  y: number;
  width: number;
  height: number;
  hexColor: string;
  label?: string;
};

// Type for a single generation
type Generation = {
  id: string;
  prompt: string;
  imageData: string;
  finalPrompt: string;
  userDescription: string;
  lightSources: LightSource[];
  timings: {
    promptGeneration: number;
    imageGeneration: number;
    lightDetection: number;
    total: number;
  };
  timestamp: Date;
};

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingLights, setLoadingLights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [finalPrompt, setFinalPrompt] = useState<string | null>(null);
  const [userDescription, setUserDescription] = useState<string | null>(null);
  const [lightSources, setLightSources] = useState<LightSource[]>([]);
  const [lightError, setLightError] = useState<string | null>(null);
  const [showLights, setShowLights] = useState(true);
  const [showAsBoxes, setShowAsBoxes] = useState(true);
  const [timings, setTimings] = useState<{
    promptGeneration: number;
    imageGeneration: number;
    lightDetection: number;
    total: number;
  } | null>(null);
  const [activeTab, setActiveTab] = useState('image');
  const [history, setHistory] = useState<Generation[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0, left: 0, top: 0 });

  // Update image size when it loads
  useEffect(() => {
    if (imageData && imageContainerRef.current) {
      const updateImageSize = () => {
        const container = imageContainerRef.current;
        const img = container?.querySelector('img');
        if (img) {
          // Use a small delay to ensure the image has fully rendered
          setTimeout(() => {
            const rect = img.getBoundingClientRect();
            setImageSize({ 
              width: rect.width, 
              height: rect.height,
              left: 0,  // Not needed with the new overlay approach
              top: 0    // Not needed with the new overlay approach
            });
          }, 0);
        }
      };
      
      // Initial check
      updateImageSize();
      
      // Set up observer for changes
      const resizeObserver = new ResizeObserver(updateImageSize);
      const img = imageContainerRef.current.querySelector('img');
      if (img) {
        resizeObserver.observe(img);
        img.onload = updateImageSize;
      }
      
      // Also observe window resize events
      window.addEventListener('resize', updateImageSize);
      
      return () => {
        if (img) resizeObserver.unobserve(img);
        resizeObserver.disconnect();
        window.removeEventListener('resize', updateImageSize);
      };
    }
  }, [imageData, activeTab]);

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
      
      setImageData(data.imageData || null);
      setFinalPrompt(data.finalPrompt || null);
      setUserDescription(data.userDescription || null);
      setTimings({
        promptGeneration: data.timings.promptGeneration,
        imageGeneration: data.timings.imageGeneration,
        lightDetection: 0,
        total: data.timings.total
      });
      
      setActiveTab('image');
      
      // After generating the image, detect light sources
      if (data.imageData) {
        await detectLightSources(data.imageData);
      }
      
      // Create a new generation and add to history
      const newGeneration: Generation = {
        id: Date.now().toString(),
        prompt,
        imageData: data.imageData || '',
        finalPrompt: data.finalPrompt || '',
        userDescription: data.userDescription || '',
        lightSources: lightSources,
        timings: timings || {
          promptGeneration: data.timings.promptGeneration,
          imageGeneration: data.timings.imageGeneration,
          lightDetection: 0,
          total: data.timings.total
        },
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
  
  const detectLightSources = async (imgData: string) => {
    setLoadingLights(true);
    setLightError(null);
    
    try {
      const response = await fetch('/api/detect-lights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageData: imgData }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to detect light sources');
      }
      
      setLightSources(data.lightSources || []);
      setLightError(data.lightError || null);
      setShowLights(true);
      setShowAsBoxes(true);
      
      // Update timings
      if (timings) {
        const updatedTimings = { 
          ...timings,
          lightDetection: data.timeTaken || 0,
          total: (timings.promptGeneration + timings.imageGeneration + (data.timeTaken || 0))
        };
        setTimings(updatedTimings);
      }
      
    } catch (err) {
      setLightError(err instanceof Error ? err.message : 'An unexpected error occurred during light detection');
    } finally {
      setLoadingLights(false);
    }
  };
  
  const loadFromHistory = (id: string) => {
    const selected = history.find(item => item.id === id);
    if (selected) {
      setImageData(selected.imageData);
      setFinalPrompt(selected.finalPrompt);
      setUserDescription(selected.userDescription);
      setLightSources(selected.lightSources || []);
      setTimings(selected.timings);
      setSelectedGeneration(id);
      setActiveTab('image');
      setHistoryOpen(false); // Close dropdown after selection
    }
  };

  // Helper to lighten a color for the glow effect
  const lightenColor = (hexColor: string): string => {
    // Remove # if present
    hexColor = hexColor.replace('#', '');
    
    // Parse the hex values
    const r = parseInt(hexColor.substr(0, 2), 16);
    const g = parseInt(hexColor.substr(2, 2), 16);
    const b = parseInt(hexColor.substr(4, 2), 16);
    
    // Lighten the color
    const lighterR = Math.min(255, r + 100);
    const lighterG = Math.min(255, g + 100);
    const lighterB = Math.min(255, b + 100);
    
    // Convert back to hex
    return `rgba(${lighterR}, ${lighterG}, ${lighterB}, 0.5)`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center mb-2">D&D Battlemap Generator</h1>
        <p className="text-gray-400 text-center mb-8">
          Generate hand-drawn style top-down 2D dungeon battlemaps using OpenAI&apos;s GPT-Image-1
        </p>
        
        {/* Input and History Section */}
        <div className="flex mb-4 gap-4 items-start">
          <div className="flex-1 flex flex-col">
            <label htmlFor="prompt" className="block text-lg font-medium mb-2">
              Describe your battlemap scene/setting:
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Examples: 'Ancient forgotten temple with overgrown vegetation' or 'Dwarven forge inside a volcano'"
              className="w-full p-4 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 min-h-[160px]"
              required
            />
          </div>
          
          <div className="flex-shrink-0 flex flex-col gap-3" style={{ minWidth: '240px' }}>
            {/* History Dropdown */}
            <div className="relative" ref={historyRef}>
              <button 
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium px-4 py-3 rounded-lg flex items-center gap-2 w-full"
                onClick={() => setHistoryOpen(!historyOpen)}
              >
                <span>History</span>
                <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {history.length || 0}
                </span>
                <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>
              
              {historyOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20">
                  <div className="p-2 max-h-96 overflow-y-auto custom-scrollbar">
                    <h3 className="uppercase text-xs font-bold text-gray-400 mb-2 px-2">Generation History</h3>
                    {history.length > 0 ? (
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
                              {item.imageData ? (
                                <img src={item.imageData} alt="Thumbnail" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gray-600 flex items-center justify-center text-xs text-gray-300">No image</div>
                              )}
                            </div>
                            <div className="overflow-hidden flex-1">
                              <p className="text-sm font-medium truncate text-white">{item.prompt}</p>
                              <p className="text-xs text-gray-400">
                                {new Date(item.timestamp).toLocaleDateString()} {new Date(item.timestamp).toLocaleTimeString()}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center p-4 text-gray-400 text-sm">
                        No generations yet
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Timing Info */}
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 flex flex-col">
              <h3 className="text-xs font-medium text-gray-400 mb-2 uppercase">Timings</h3>
              <div className="flex flex-col text-xs gap-1">
                <div className="flex justify-between">
                  <span className="text-blue-400">Prompt:</span>
                  <span>{timings ? (timings.promptGeneration / 1000).toFixed(1) + 's' : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-400">Image:</span>
                  <span>{timings ? (timings.imageGeneration / 1000).toFixed(1) + 's' : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-yellow-400">Lights:</span>
                  <span>{timings && timings.lightDetection > 0 ? (timings.lightDetection / 1000).toFixed(1) + 's' : '-'}</span>
                </div>
                <div className="flex justify-between font-medium pt-1 border-t border-gray-700 mt-1">
                  <span className="text-purple-400">Total:</span>
                  <span>{timings ? (timings.total / 1000).toFixed(1) + 's' : '-'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Generate Button Section */}
        <div className="flex items-center mb-8 gap-4">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating Battlemap...' : 'Generate Battlemap'}
          </button>
          
          {imageData && (
            <button
              onClick={() => detectLightSources(imageData)}
              disabled={loadingLights || loading}
              className="bg-amber-600 hover:bg-amber-700 text-white font-medium py-4 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingLights ? 'Detecting Lights...' : 'Regenerate Lights'}
            </button>
          )}
        </div>
        
        {error && (
          <div className="bg-red-900/60 border border-red-700 text-red-200 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}
        
        {lightError && (
          <div className="bg-amber-900/60 border border-amber-700 text-amber-200 px-4 py-3 rounded-lg mb-6">
            <strong>Light Detection Error:</strong> {lightError}
          </div>
        )}
        
        {/* Generated content */}
        {imageData && (
          <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg">
            {/* Tabs */}
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
              <button 
                onClick={() => setActiveTab('lights')}
                className={`px-6 py-3 font-medium ${activeTab === 'lights' 
                  ? 'border-b-2 border-blue-500 text-blue-400' 
                  : 'text-gray-400 hover:text-gray-200'}`}
              >
                Light Details
              </button>
              
              {/* Light toggles */}
              {lightSources.length > 0 && (
                <div className="ml-auto flex items-center mr-4 gap-4">
                  {/* Show Lights Toggle */}
                  <div className="flex items-center">
                    <span className="text-xs font-medium text-gray-400 mr-2">
                      Lights
                    </span>
                    <label htmlFor="light-toggle" className="relative inline-block w-9 h-5 cursor-pointer">
                      <input
                        type="checkbox"
                        id="light-toggle"
                        checked={showLights}
                        onChange={() => setShowLights(!showLights)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-blue-400 after:border-blue-400 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gray-600"></div>
                    </label>
                  </div>
                  
                  {/* Display Mode Toggle */}
                  {showLights && (
                    <div className="flex items-center">
                      <span className="text-xs font-medium text-gray-400 mr-2">
                        Boxes
                      </span>
                      <label htmlFor="box-toggle" className="relative inline-block w-9 h-5 cursor-pointer">
                        <input
                          type="checkbox"
                          id="box-toggle"
                          checked={showAsBoxes}
                          onChange={() => setShowAsBoxes(!showAsBoxes)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-blue-400 after:border-blue-400 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gray-600"></div>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Tab content */}
            <div className="p-4">
              {activeTab === 'image' && (
                <div className="flex justify-center relative" ref={imageContainerRef}>
                  {imageData ? (
                    <div className="relative">
                      <img 
                        src={imageData} 
                        alt="Generated Battlemap"
                        className="max-w-full max-h-[80vh] object-contain"
                      />
                      
                      {/* Light overlay - moved inside img container */}
                      {showLights && lightSources.length > 0 && imageSize.width > 0 && (
                        <div 
                          className="absolute top-0 left-0 pointer-events-none"
                          style={{ 
                            width: '100%',
                            height: '100%',
                            // Add red border for debugging
                            border: '1px dashed rgba(255,0,0,0.2)'
                          }}
                        >
                          {lightSources.map((light, index) => {
                            // Apply the ratio to position and size
                            const x = light.x * imageSize.width;
                            const y = light.y * imageSize.height;
                            const width = light.width * imageSize.width;
                            const height = light.height * imageSize.height;
                            
                            // Calculate center point
                            const centerX = x + (width / 2);
                            const centerY = y + (height / 2);
                            
                            // Calculate radius for light source visualization
                            const radius = Math.max(width, height) / 2;

                            // Determine light type
                            const isWarmLight = light.hexColor.toLowerCase().includes('f');
                            const glowOpacity = isWarmLight ? 0.6 : 0.5;
                            
                            if (showAsBoxes) {
                              // Bounding box rendering
                              return (
                                <div key={index} className="absolute" style={{
                                  left: `${x}px`,
                                  top: `${y}px`,
                                  width: `${width}px`,
                                  height: `${height}px`,
                                  border: `2px solid ${light.hexColor}`,
                                  boxShadow: `0 0 5px ${light.hexColor}`,
                                  borderRadius: '2px',
                                  pointerEvents: 'none',
                                }}>
                                  {/* Light label */}
                                  {light.label && (
                                    <div style={{
                                      background: light.hexColor,
                                      color: '#fff',
                                      fontSize: '10px',
                                      padding: '2px 4px',
                                      borderRadius: '2px 0 2px 0',
                                      position: 'absolute',
                                      top: '0',
                                      left: '0',
                                      maxWidth: '100%',
                                      overflow: 'hidden',
                                      textShadow: '0 0 2px rgba(0,0,0,0.7)',
                                      whiteSpace: 'nowrap',
                                      textOverflow: 'ellipsis'
                                    }}>
                                      {light.label}
                                    </div>
                                  )}
                                  
                                  {/* Light glow effect */}
                                  <div
                                    className="absolute inset-0"
                                    style={{
                                      background: `radial-gradient(circle, ${lightenColor(light.hexColor)} 0%, transparent 70%)`,
                                      opacity: glowOpacity,
                                      mixBlendMode: 'screen',
                                    }}
                                  />
                                </div>
                              );
                            } else {
                              // Light source dot rendering
                              return (
                                <div key={index} className="absolute" style={{
                                  left: `${centerX - radius}px`,
                                  top: `${centerY - radius}px`,
                                  width: `${radius * 2}px`,
                                  height: `${radius * 2}px`,
                                  pointerEvents: 'none',
                                }}>
                                  {/* Light glow effect */}
                                  <div
                                    className="absolute inset-0 rounded-full"
                                    style={{
                                      background: `radial-gradient(circle, ${lightenColor(light.hexColor)} 0%, ${light.hexColor}80 70%, ${light.hexColor} 100%)`,
                                      opacity: glowOpacity + 0.1,
                                      boxShadow: `0 0 10px 2px ${light.hexColor}`,
                                    }}
                                  />
                                </div>
                              );
                            }
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-[50vh] bg-gray-700 flex items-center justify-center text-gray-400">
                      No image available
                    </div>
                  )}
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
              
              {activeTab === 'lights' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-4">
                    <h3 className="text-lg font-medium text-gray-300">Detected Light Sources</h3>
                    
                    {lightError && (
                      <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 rounded-lg">
                        <p className="font-medium">Error detecting lights:</p>
                        <p>{lightError}</p>
                      </div>
                    )}
                    
                    {lightSources.length > 0 ? (
                      <div className="bg-gray-900 rounded-lg overflow-hidden">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-gray-800 text-left">
                              <th className="p-3 font-medium">#</th>
                              <th className="p-3 font-medium">Position</th>
                              <th className="p-3 font-medium">Size</th>
                              <th className="p-3 font-medium">Color</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lightSources.map((light, index) => (
                              <tr key={index} className="border-t border-gray-800 hover:bg-gray-800/50">
                                <td className="p-3">{index + 1}</td>
                                <td className="p-3">
                                  <span className="text-blue-400">x:</span> {(light.x * 100).toFixed(1)}%,{' '}
                                  <span className="text-blue-400">y:</span> {(light.y * 100).toFixed(1)}%
                                </td>
                                <td className="p-3">
                                  <span className="text-blue-400">w:</span> {(light.width * 100).toFixed(1)}%,{' '}
                                  <span className="text-blue-400">h:</span> {(light.height * 100).toFixed(1)}%
                                </td>
                                <td className="p-3">
                                  <div className="flex items-center">
                                    <div 
                                      className="w-6 h-6 mr-2 rounded" 
                                      style={{ backgroundColor: light.hexColor }}
                                    ></div>
                                    <span>{light.hexColor}</span>
                                    {light.label && <span className="ml-2 text-gray-400">({light.label})</span>}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="bg-gray-900 p-4 rounded-lg text-gray-500 text-center">
                        No light sources were detected in the image.
                      </div>
                    )}

                    <div className="mt-6">
                      <h3 className="text-lg font-medium mb-2 text-gray-300">About Light Detection</h3>
                      <div className="bg-gray-900 p-4 rounded-lg text-gray-300">
                        <p>Light sources are detected using Claude 3.7 Sonnet to analyze the image. Each detected light has:</p>
                        <ul className="list-disc ml-5 mt-2 space-y-1">
                          <li>Position coordinates (x, y) normalized from 0-1</li>
                          <li>Size dimensions (width, height) normalized from 0-1</li>
                          <li>A label describing the type of light source (torch, magic, etc.)</li>
                          <li>A hexadecimal color code approximating the light source color</li>
                        </ul>
                      </div>
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
