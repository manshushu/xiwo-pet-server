using System;
using System.Diagnostics;
using System.IO;

namespace XiwoPetLauncher
{
    class Program
    {
        static void Main(string[] args)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string batPath = Path.Combine(baseDir, "一键安装并启动保活服务.bat");

            if (!File.Exists(batPath))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("Error: script not found: " + batPath);
                Console.ResetColor();
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
                return;
            }

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "cmd.exe";
            psi.Arguments = "/c \"" + batPath + "\"";
            psi.WorkingDirectory = baseDir;
            psi.UseShellExecute = false;

            try
            {
                using (Process proc = Process.Start(psi))
                {
                    proc.WaitForExit();
                }
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("Launch error: " + ex.Message);
                Console.ResetColor();
                Console.WriteLine("Press any key to exit...");
                Console.ReadKey();
            }
        }
    }
}
