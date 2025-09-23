import { MapPin, BarChart3, Users } from 'lucide-react'

export default function FeatureCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
      <div 
        className="group relative bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20 hover:bg-white/90 hover:-translate-y-1"
        tabIndex={0}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div className="relative z-10">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
            <MapPin className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 group-hover:text-blue-700 transition-colors">Interactive Mapping</h2>
          <p className="text-gray-600 leading-relaxed">
            Draw properties as points or polygons on Google Maps with real-time editing.
          </p>
        </div>
      </div>

      <div 
        className="group relative bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20 hover:bg-white/90 hover:-translate-y-1"
        tabIndex={0}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-green-50/50 to-emerald-50/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div className="relative z-10">
          <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 group-hover:text-green-700 transition-colors">Analytics Dashboard</h2>
          <p className="text-gray-600 leading-relaxed">
            Track coverage, activity, and freshness by submarket.
          </p>
        </div>
      </div>

      <div 
        className="group relative bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20 hover:bg-white/90 hover:-translate-y-1 md:col-span-2 lg:col-span-1"
        tabIndex={0}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50/50 to-violet-50/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div className="relative z-10">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-violet-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
            <Users className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-semibold mb-3 text-gray-900 group-hover:text-purple-700 transition-colors">Pipeline Management</h2>
          <p className="text-gray-600 leading-relaxed">
            Move prospects from first call to client with clear statuses and follow-ups.
          </p>
        </div>
      </div>
    </div>
  )
}

