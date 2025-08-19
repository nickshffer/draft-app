import React, { useState } from 'react';
import { X, Users, Settings, Timer, DollarSign, List, Eye } from 'lucide-react';

interface WelcomePopupProps {
  isHost: boolean;
  onClose: () => void;
  onDontShowAgain: () => void;
}

const WelcomePopup: React.FC<WelcomePopupProps> = ({ isHost, onClose, onDontShowAgain }) => {
  const [dontShow, setDontShow] = useState(false);

  const handleClose = () => {
    if (dontShow) {
      onDontShowAgain();
    }
    onClose();
  };

  const hostInstructions = [
    {
      icon: <Settings className="w-5 h-5 text-blue-600" />,
      title: "Configure Draft Settings",
      description: "Set up auction budget, roster size, auction rounds, and team information in Settings."
    },
    {
      icon: <Users className="w-5 h-5 text-green-600" />,
      title: "Manage Teams",
      description: "Edit team names and owners, reorder draft positions, and track budgets in the left sidebar."
    },
    {
      icon: <DollarSign className="w-5 h-5 text-purple-600" />,
      title: "Run the Auction",
      description: "Select players to start bidding. Manage timer, accept bids, and complete picks in the right panel."
    },
    {
      icon: <Timer className="w-5 h-5 text-orange-600" />,
      title: "Control Draft Flow",
      description: "After auction rounds, the app automatically switches to snake draft based on remaining budgets."
    },
    {
      icon: <List className="w-5 h-5 text-red-600" />,
      title: "Upload Player Data",
      description: "This will change the *global* data for all users but they will still see their custom data to the side."
    }
  ];

  const viewerInstructions = [
    {
      icon: <Eye className="w-5 h-5 text-blue-600" />,
      title: "Watch the Draft",
      description: "Follow along as the host runs the draft. All picks, budgets, and timers update in real-time."
    },
    {
      icon: <Users className="w-5 h-5 text-green-600" />,
      title: "Track Teams",
      description: "View all team rosters, remaining budgets, and draft positions in the left sidebar."
    },
    {
      icon: <List className="w-5 h-5 text-purple-600" />,
      title: "Browse Players",
      description: "Search and filter available players by position, team, or name in the main tabs. If you uploaded custom data you will see it next to the host data. Column sorting is done based on custom values."
    },
    {
      icon: <Timer className="w-5 h-5 text-orange-600" />,
      title: "Follow Draft Progress",
      description: "See current round, pick number, draft mode (auction/snake), and who's on the clock."
    },
    {
      icon: <Settings className="w-5 h-5 text-red-600" />,
      title: "Track Your Team",
      description: "Go to Settings and select your team under 'My Team for Roster Display' to keep track of your roster in the right sidebar throughout the draft."
    }
  ];

  const instructions = isHost ? hostInstructions : viewerInstructions;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div 
        className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto border-4 border-black"
        style={{ boxShadow: '8px 8px 0 #000' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#04AEC5] to-[#EF416E] p-4 border-b-4 border-black">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-white" style={{ textShadow: '2px 2px 0 #000' }}>
                Welcome to Fantasy Football Draft!
              </h2>
              <p className="text-[#FCF188] font-medium">
                {isHost ? 'Host Instructions' : 'Viewer Instructions'}
              </p>
            </div>
            <button 
              onClick={handleClose}
              className="text-white hover:text-[#FCF188] border-2 border-white p-1"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="space-y-6">
            {instructions.map((instruction, index) => (
              <div key={index} className="flex items-start space-x-4 p-4 border-2 border-gray-200 bg-gray-50">
                <div className="flex-shrink-0 p-2 bg-white border-2 border-black">
                  {instruction.icon}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-black mb-2">{instruction.title}</h3>
                  <p className="text-gray-700 leading-relaxed">{instruction.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Additional Tips */}
          <div className="mt-6 p-4 bg-[#FCF188] border-2 border-black">
            <h3 className="text-lg font-bold text-black mb-2">💡 Pro Tips</h3>
            <ul className="text-black space-y-1 text-sm">
              {isHost ? (
                <>
                  <li>• Use the undo button to fix mistakes - it appears after each pick</li>
                  <li>• The app automatically handles auction-to-snake transition</li>
                  <li>• Teams are sorted by remaining budget for snake draft order</li>
                  <li>• Share your room URL with participants to let them join</li>
                </>
              ) : (
                <>
                  <li>• The draft updates in real-time - no need to refresh</li>
                  <li>• Click on team names to expand/collapse their rosters</li>
                  <li>• Use the search and filters to find specific players</li>
                  <li>• Switch between tabs to view players by position or see draft history</li>
                </>
              )}
            </ul>
          </div>

          {/* Don't show again checkbox */}
          <div className="mt-6 flex items-center justify-between p-4 border-2 border-black bg-white">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={dontShow}
                onChange={(e) => setDontShow(e.target.checked)}
                className="w-5 h-5 border-2 border-black"
              />
              <span className="text-black font-medium">
                Don't show these instructions again {isHost ? 'when hosting' : 'when viewing'}
              </span>
            </label>
            <button
              onClick={handleClose}
              className="px-6 py-3 bg-[#04AEC5] text-white font-bold border-2 border-black hover:bg-[#8ED4D3]"
              style={{ boxShadow: '3px 3px 0 #000' }}
            >
              Got It!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomePopup;
