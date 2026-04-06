import { useState } from "react";
import axios from "axios";
const ChatPage = () => {
  const [message, setMessage] = useState<any>();
  const handleKeyDown = (event: any) => {
    if (event.key === "Enter") {
      handleClick();
    }
  };
  const handleClick = () => {
    console.log("Message to send:", message);
    if (!message) {
      alert("Please send the relevant file");
      return;
    }
    try {
      axios
        .post("http://localhost:3009/query", {
          query: message,
        })
        .then(function (response) {
          console.log(response);
        })
        .catch(function (error) {
          console.log(error);
        });
    } catch (error) {
      console.error("Error occurred while sending message:", error);
    } finally {
      setMessage("");
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-600  font-bold text-white ">
      <img className="absolute h-screen" src="/public/bg.webp" />
      <div className="relative mt-130 flex h-30 w-3xl justify-between rounded-4xl border-2 border-pink-400">
        <input
          className="relative top-2/5 left-8  w-10/12 text-gray-400 focus:outline-none"
          type="file"
          onChange={(e) => setMessage(e.target.value)}
          value={message}
          onKeyDown={handleKeyDown}
        />
        <div className="relative flex  items-center justify-end  px-4">
          <button
            className="relative inline-flex items-center justify-center overflow-hidden  text-white "
            onClick={handleClick}
          >
            <img
              src="/public/arrow.png"
              className="h-10 w-10 rounded-full bg-pink-400 p-2 transition-transform duration-300 ease-in-out hover:bg-pink-500"
            />
          </button>
        </div>
      </div>
    </div>
  );
};
export default ChatPage;
