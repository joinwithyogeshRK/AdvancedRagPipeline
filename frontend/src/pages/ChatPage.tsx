import { useState } from "react";
import axios from "axios";

const ChatPage = () => {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [isFilePicked, setIsFilePicked] = useState(false);

  const handleKeyDown = (event) => {
    if (event.key === "Enter") handleClick();
  };

  const handleFileChange = (e: any) => {
    e.preventDefault();
    const selected = e.target.files[0];
    console.log("Selected file:", selected);
   
    if (!selected) return;

    // 🔒 Validation (frontend level)
    if (selected.type !== "application/pdf") {
      alert("Only PDF files are allowed");
      return;
    }

    setFile(selected);
    setFileName(selected.name);
    setIsFilePicked(true);
  };
  
   

  const removeFile = () => {
    setFile(null);
    setFileName("");
  };

  const handleClick = async() => {
    console.log("Message:", message);
    console.log("File:", file);
    
 const formData = new FormData();
 formData.append("File", file);
 console.log("formadata", formData);

    axios
      .post("http://localhost:3009/query", 
        
formData

      )
      .then((res) => console.log(res))
      .catch((err) => console.log(err));

    setMessage("");
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-600 font-bold text-white">
      <img className="absolute h-screen w-full object-cover" src="/bg.webp" />

      <div className="relative mt-40 flex w-3xl items-center justify-between rounded-4xl border-2 border-pink-400 bg-black/30 p-3 backdrop-blur-lg">
        {/* 📂 Upload Section */}
        <label className="group flex w-40 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-600 p-3 transition-all duration-300  ">
          {!file ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-800 transition ">
                <span className="text-2xl text-gray-400 group-hover:text-pink-400">
                  +
                </span>
              </div>
              <p className="mt-2 text-xs text-gray-400">Upload PDF</p>
            </>
          ) : (
            <>
              <p className="text-center text-xs break-words text-green-400">
                {fileName}
              </p>
              <button
                type="button"
                onClick={removeFile}
                className="hover:text-pink -300 mt-2 text-xs
                                text-pink-400"
              >
                Remove
              </button>
            </>
          )}

          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>

        {/* 💬 Input */}
        <input
          className="mx-4 w-full bg-transparent text-white placeholder-gray-400 focus:outline-none"
          type="text"
          placeholder="Upload PDF and start asking..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        {/* 🚀 Send Button */}
        <button onClick={handleClick}>
          <img
            src="/arrow.png"
            className="h-10 w-10 rounded-full bg-pink-400 p-2 transition hover:bg-pink-500"
          />
        </button>
      </div>
    </div>
  );
};;

export default ChatPage;
