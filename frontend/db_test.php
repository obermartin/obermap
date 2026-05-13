<?php
$host = 'db5020452906.hosting-data.io';
$user = 'dbu347313';
$pass = 'aN19ehfS863SfvgXav1sOcvibu20a9sduOUAYVDyq083y7bh';

$conn = new mysqli($host, $user, $pass);
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}
echo "Connected successfully\n";

// Show databases
$result = $conn->query("SHOW DATABASES");
if ($result) {
    while($row = $result->fetch_row()) {
        echo "DB: " . $row[0] . "\n";
    }
} else {
    echo "Error showing databases: " . $conn->error . "\n";
}

$conn->close();
?>
