using System;
using System.Diagnostics;
using System.IO;
using System.Text;

namespace XiwoPetUpgrade
{
    class Program
    {
        static int Main(string[] args)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string ps1Path = Path.Combine(baseDir, "scripts", "upgrade_deploy.ps1");

            if (!File.Exists(ps1Path))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("Error: upgrade script not found: " + ps1Path);
                Console.ResetColor();
                Console.WriteLine("Press Enter to exit...");
                Console.ReadLine();
                return 2;
            }

            StringBuilder argBuilder = new StringBuilder();
            argBuilder.Append("-NoProfile -ExecutionPolicy Bypass -File \"");
            argBuilder.Append(ps1Path.Replace("\"", "\\\""));
            argBuilder.Append("\"");
            foreach (string a in args)
            {
                if (a.IndexOf(' ') >= 0 || a.IndexOf('"') >= 0)
                {
                    argBuilder.Append(" \"");
                    argBuilder.Append(a.Replace("\"", "\\\""));
                    argBuilder.Append("\"");
                }
                else
                {
                    argBuilder.Append(" ");
                    argBuilder.Append(a);
                }
            }

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "powershell.exe";
            psi.Arguments = argBuilder.ToString();
            psi.WorkingDirectory = baseDir;
            psi.UseShellExecute = false;

            try
            {
                using (Process proc = Process.Start(psi))
                {
                    proc.WaitForExit();
                    return proc.ExitCode;
                }
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("Upgrade error: " + ex.Message);
                Console.ResetColor();
                Console.WriteLine("Press Enter to exit...");
                Console.ReadLine();
                return 1;
            }
        }
    }
}