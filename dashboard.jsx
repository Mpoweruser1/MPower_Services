import React from 'react';

const sectors = [
  { id: 'hospital', title: 'Hospitals & Doctors', icon: '🏥', desc: 'Book medical checkups and specialist consults.' },
  { id: 'school', title: 'Schools & Teachers', icon: '🏫', desc: 'Schedule parent-teacher meetings and campus visits.' },
  { id: 'shop', title: 'Readymade Clothing Shops', icon: '🛍️', desc: 'Reserve trial rooms and personal shopping slots.' }
];

export default function Dashboard({ onSelectSector }) {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="max-w-4xl mx-auto mb-10 text-center">
        <h1 className="text-4xl font-extrabold text-blue-600 mb-2">Mpower</h1>
        <p className="text-gray-600 text-lg">Instant appointment booking for your essential daily needs</p>
      </header>

      <main className="max-w-4xl mx-auto grid gap-6 md:grid-cols-3">
        {sectors.map((sector) => (
          <div 
            key={sector.id}
            onClick={() => onSelectSector(sector.id)}
            className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer transform hover:-translate-y-1"
          >
            <span className="text-4xl block mb-4">{sector.icon}</span>
            <h2 className="text-xl font-bold text-gray-800 mb-2">{sector.title}</h2>
            <p className="text-gray-500 text-sm">{sector.desc}</p>
            <button className="mt-4 w-full bg-blue-50 text-blue-600 py-2 rounded-xl font-medium hover:bg-blue-100 transition-colors">
              Open Booking
            </button>
          </div>
        ))}
      </main>
    </div>
  );
}
